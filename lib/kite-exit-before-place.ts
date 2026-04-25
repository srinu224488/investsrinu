import { kiteGet, kiteDeleteEnvelope, kitePostFormEnvelope } from "./kite-client";
import type { KitePlaceOrderBody } from "./kite-place-order";

const TERMINAL_STATUS = new Set([
  "COMPLETE",
  "CANCELLED",
  "REJECTED",
  "CANCELLED AMO",
]);

const SKIP_CANCEL_STATUS = new Set(["CANCEL PENDING"]);

type KitePositionsData = { net?: unknown[]; day?: unknown[]; [k: string]: unknown };

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function normUpper(v: unknown): string {
  return str(v).toUpperCase();
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isCancellable(status: string): boolean {
  const u = status.toUpperCase();
  if (!u) return false;
  if (TERMINAL_STATUS.has(u)) return false;
  if (SKIP_CANCEL_STATUS.has(u)) return false;
  return true;
}

export type ExitBeforePlaceCancelRow = {
  order_id: string;
  status: string;
  /** Payload sent to Kite DELETE /orders/:variety/:order_id */
  payload: { variety: string; order_id: string };
  /** Raw response envelope from Kite for this cancel call. */
  response: unknown;
};
export type ExitBeforePlaceError = { order_id: string; message: string };

export type ExitBeforePlaceResult = {
  /** Pending orders cancelled before placing the new one. */
  cancelled: ExitBeforePlaceCancelRow[];
  /** Order ID of the market exit order placed to close an open position, or null if none. */
  exit_order_id: string | null;
  /** Side of the exit order: BUY to cover a short, SELL to exit a long. */
  exit_transaction_type?: "BUY" | "SELL";
  /** Quantity of the exit order (abs net position). */
  exit_quantity?: number;
  /** Fields sent to Kite POST /orders/:variety for the exit order. */
  exit_order_payload?: Record<string, string | number | undefined>;
  /** Raw response envelope from Kite for the exit order call. */
  exit_order_response?: unknown;
  errors: ExitBeforePlaceError[];
  orders_fetch_error?: string;
  positions_fetch_error?: string;
  /** Diagnostic: total rows in Kite net positions response. */
  net_positions_count?: number;
  /** Diagnostic: quantity of the matched position row (before exit was placed), or null if no row matched. */
  matched_position_quantity?: number | null;
};

/**
 * Before placing a new order:
 * 1. Cancel ALL non-terminal pending orders for this exchange/tradingsymbol/product (any side).
 * 2. Fetch day positions — if a net open position exists, place a MARKET exit order to close it.
 *
 * Best-effort: does not throw; the caller should still proceed to place the new entry after this.
 * Pass `cachedOrders` from a prior GET /orders call to avoid a second fetch.
 */
export async function exitBeforePlace(
  accessToken: string,
  fields: KitePlaceOrderBody,
  cachedOrders?: unknown[],
): Promise<ExitBeforePlaceResult> {
  const ex = normUpper(fields.exchange);
  const sym = normUpper(fields.tradingsymbol);
  const prod = normUpper(fields.product);

  if (!ex || !sym || !prod) {
    return { cancelled: [], exit_order_id: null, errors: [] };
  }

  // ── Step 1: cancel all non-terminal orders for this symbol/product (any side) ──

  let orders: unknown[];
  let orders_fetch_error: string | undefined;

  if (cachedOrders !== undefined) {
    orders = cachedOrders;
  } else {
    try {
      orders = await kiteGet<unknown[]>("/orders", accessToken);
    } catch (e) {
      orders = [];
      orders_fetch_error =
        e instanceof Error ? e.message : "orders_fetch_failed";
    }
  }

  const list = Array.isArray(orders) ? orders : [];
  const cancelled: ExitBeforePlaceCancelRow[] = [];
  const errors: ExitBeforePlaceError[] = [];

  for (const row of list) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;

    if (normUpper(o.tradingsymbol) !== sym) continue;
    if (normUpper(o.product) !== prod) continue;
    if (normUpper(o.exchange) !== ex) continue;

    const st = str(o.status);
    if (!isCancellable(st)) continue;

    const pending = num(o.pending_quantity);
    if (pending !== undefined && pending <= 0) continue;

    const orderId = str(o.order_id);
    if (!orderId) continue;

    const variety = str(o.variety) || "regular";
    const parentRaw = o.parent_order_id;
    const parentOrderId =
      parentRaw != null && String(parentRaw).trim()
        ? String(parentRaw).trim()
        : undefined;

    const cancelPayload = { variety, order_id: orderId };
    const env = await kiteDeleteEnvelope<{ order_id: string }>(
      variety,
      orderId,
      accessToken,
      parentOrderId,
    );

    if (env.status === "success") {
      const id =
        env.data && typeof env.data === "object" && env.data !== null
          ? str((env.data as { order_id?: unknown }).order_id)
          : orderId;
      cancelled.push({ order_id: id || orderId, status: "cancelled", payload: cancelPayload, response: env });
    } else {
      errors.push({
        order_id: orderId,
        message: env.message || env.error_type || "cancel_failed",
      });
    }
  }

  // ── Step 2: exit any net open day position ──

  let positions_fetch_error: string | undefined;
  let exit_order_id: string | null = null;

  let posData: KitePositionsData;
  try {
    posData = await kiteGet<KitePositionsData>("/portfolio/positions", accessToken);
  } catch (e) {
    positions_fetch_error =
      e instanceof Error ? e.message : "positions_fetch_failed";
    return {
      cancelled,
      exit_order_id,
      errors,
      ...(orders_fetch_error ? { orders_fetch_error } : {}),
      positions_fetch_error,
    };
  }

  // Kite `GET /portfolio/positions` returns two separate arrays:
  //   net  — consolidated open quantity across ALL sessions (overnight carry + today)
  //   day  — today-only position changes
  //
  // `net` is the authoritative "total open" view. `day` is scanned as a fallback so that
  // same-session NRML positions (opened today, no overnight component) are also caught.
  // We iterate both, deduplicated by taking the first non-zero quantity match.
  const netArr = Array.isArray(posData?.net) ? posData.net : [];
  const dayArr = Array.isArray(posData?.day) ? posData.day : [];
  const allRows = [...netArr, ...dayArr];
  const net_positions_count = netArr.length;

  let matched_position_quantity: number | null = null;

  for (const row of allRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const p = row as Record<string, unknown>;

    if (normUpper(p.tradingsymbol) !== sym) continue;
    if (normUpper(p.exchange) !== ex) continue;
    if (normUpper(p.product) !== prod) continue;

    const qty = num(p.quantity);
    if (qty === undefined || qty === 0) {
      // Record that we found a matching row but it was flat — keep scanning.
      if (matched_position_quantity === null) matched_position_quantity = 0;
      continue;
    }

    // Found a non-zero open position — place a MARKET exit order to close it.
    matched_position_quantity = qty;
    const exitSide = qty > 0 ? "SELL" : "BUY";
    const exitQty = Math.abs(qty);
    const variety = str(fields.variety) || "regular";

    const exitOrderPayload: Record<string, string | number | undefined> = {
      exchange: ex,
      tradingsymbol: sym,
      transaction_type: exitSide,
      quantity: exitQty,
      order_type: "MARKET",
      product: prod,
      validity: "DAY",
      market_protection: -1,
    };

    const env = await kitePostFormEnvelope<{ order_id: string }>(
      `/orders/${encodeURIComponent(variety)}`,
      accessToken,
      exitOrderPayload,
    );

    if (env.status === "success" && env.data) {
      exit_order_id =
        str((env.data as { order_id?: unknown }).order_id) || null;
    } else if (env.status === "error") {
      errors.push({
        order_id: "exit_position",
        message: env.message || env.error_type || "exit_order_failed",
      });
    }
    return {
      cancelled,
      exit_order_id,
      exit_transaction_type: exitSide,
      exit_quantity: exitQty,
      exit_order_payload: exitOrderPayload,
      exit_order_response: env,
      errors,
      net_positions_count,
      matched_position_quantity,
      ...(orders_fetch_error ? { orders_fetch_error } : {}),
      ...(positions_fetch_error ? { positions_fetch_error } : {}),
    };
  }

  // Scanned all rows — no non-zero position found.
  return {
    cancelled,
    exit_order_id,
    errors,
    net_positions_count,
    matched_position_quantity,
    ...(orders_fetch_error ? { orders_fetch_error } : {}),
    ...(positions_fetch_error ? { positions_fetch_error } : {}),
  };
}
