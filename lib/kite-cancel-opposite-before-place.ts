import { kiteDeleteEnvelope, kiteGet } from "./kite-client";
import type { KitePlaceOrderBody } from "./kite-place-order";

/** Kite order statuses: end states — do not send DELETE (see Kite Connect v3 Orders / Order statuses). */
const TERMINAL_STATUS = new Set([
  "COMPLETE",
  "CANCELLED",
  "REJECTED",
  "CANCELLED AMO",
]);

/** In-flight: cancel already requested at exchange. */
const SKIP_CANCEL_STATUS = new Set(["CANCEL PENDING"]);

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function normUpper(v: unknown): string {
  return str(v).toUpperCase();
}

function oppositeSide(tx: string): "BUY" | "SELL" | null {
  const u = tx.trim().toUpperCase();
  if (u === "BUY") return "SELL";
  if (u === "SELL") return "BUY";
  return null;
}

function isCancellableStatus(status: string): boolean {
  const u = status.toUpperCase();
  if (!u) return false;
  if (TERMINAL_STATUS.has(u)) return false;
  if (SKIP_CANCEL_STATUS.has(u)) return false;
  return true;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** When Kite includes pending_quantity on the order row, skip if nothing remains to cancel. */
function hasNothingLeftToCancel(o: Record<string, unknown>): boolean {
  const pending = num(o.pending_quantity);
  if (pending !== undefined && pending <= 0) return true;
  return false;
}

export type PrePlaceCancelRow = { order_id: string; status: string };

export type PrePlaceCancelError = { order_id: string; message: string };

export type PrePlaceCancelsResult = {
  cancelled: PrePlaceCancelRow[];
  errors: PrePlaceCancelError[];
  orders_fetch_error?: string;
};

/**
 * Best-effort: cancel open orders on the opposite side for the same exchange,
 * tradingsymbol, and product. Does not throw; callers should still place after this.
 * Pass `cachedOrders` from a prior GET /orders in the same request to avoid a second fetch.
 */
export async function cancelOppositePendingOrders(
  accessToken: string,
  fields: KitePlaceOrderBody,
  cachedOrders?: unknown[],
): Promise<PrePlaceCancelsResult> {
  const incoming = normUpper(fields.transaction_type);
  const wantOpposite = oppositeSide(incoming);
  if (!wantOpposite) {
    return { cancelled: [], errors: [] };
  }

  const ex = normUpper(fields.exchange);
  const sym = normUpper(fields.tradingsymbol);
  const prod = normUpper(fields.product);
  if (!ex || !sym || !prod) {
    return { cancelled: [], errors: [] };
  }

  let orders: unknown[];
  if (cachedOrders !== undefined) {
    orders = cachedOrders;
  } else {
    try {
      orders = await kiteGet<unknown[]>("/orders", accessToken);
    } catch (e) {
      return {
        cancelled: [],
        errors: [],
        orders_fetch_error:
          e instanceof Error ? e.message : "orders_fetch_failed",
      };
    }
  }

  const list = Array.isArray(orders) ? orders : [];
  const cancelled: PrePlaceCancelRow[] = [];
  const errors: PrePlaceCancelError[] = [];

  for (const row of list) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;

    if (normUpper(o.tradingsymbol) !== sym) continue;
    if (normUpper(o.product) !== prod) continue;
    if (normUpper(o.exchange) !== ex) continue;
    if (normUpper(o.transaction_type) !== wantOpposite) continue;

    const st = str(o.status);
    if (!isCancellableStatus(st)) continue;
    if (hasNothingLeftToCancel(o)) continue;

    const orderId = str(o.order_id);
    if (!orderId) continue;

    const variety = str(o.variety) || "regular";
    const parentRaw = o.parent_order_id;
    const parentOrderId =
      parentRaw != null && String(parentRaw).trim()
        ? String(parentRaw).trim()
        : undefined;

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
      cancelled.push({ order_id: id || orderId, status: "cancelled" });
    } else {
      errors.push({
        order_id: orderId,
        message: env.message || env.error_type || "cancel_failed",
      });
    }
  }

  return { cancelled, errors };
}

/**
 * Best-effort: cancel open orders on the same side for the same exchange,
 * tradingsymbol, and product (replace stacked same-side pendings before a new place).
 * Does not throw; callers should still place after this.
 */
export async function cancelSameSidePendingOrders(
  accessToken: string,
  fields: KitePlaceOrderBody,
  cachedOrders?: unknown[],
): Promise<PrePlaceCancelsResult> {
  const incoming = normUpper(fields.transaction_type);
  if (incoming !== "BUY" && incoming !== "SELL") {
    return { cancelled: [], errors: [] };
  }

  const ex = normUpper(fields.exchange);
  const sym = normUpper(fields.tradingsymbol);
  const prod = normUpper(fields.product);
  if (!ex || !sym || !prod) {
    return { cancelled: [], errors: [] };
  }

  let orders: unknown[];
  if (cachedOrders !== undefined) {
    orders = cachedOrders;
  } else {
    try {
      orders = await kiteGet<unknown[]>("/orders", accessToken);
    } catch (e) {
      return {
        cancelled: [],
        errors: [],
        orders_fetch_error:
          e instanceof Error ? e.message : "orders_fetch_failed",
      };
    }
  }

  const list = Array.isArray(orders) ? orders : [];
  const cancelled: PrePlaceCancelRow[] = [];
  const errors: PrePlaceCancelError[] = [];

  for (const row of list) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;

    if (normUpper(o.tradingsymbol) !== sym) continue;
    if (normUpper(o.product) !== prod) continue;
    if (normUpper(o.exchange) !== ex) continue;
    if (normUpper(o.transaction_type) !== incoming) continue;

    const st = str(o.status);
    if (!isCancellableStatus(st)) continue;
    if (hasNothingLeftToCancel(o)) continue;

    const orderId = str(o.order_id);
    if (!orderId) continue;

    const variety = str(o.variety) || "regular";
    const parentRaw = o.parent_order_id;
    const parentOrderId =
      parentRaw != null && String(parentRaw).trim()
        ? String(parentRaw).trim()
        : undefined;

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
      cancelled.push({ order_id: id || orderId, status: "cancelled" });
    } else {
      errors.push({
        order_id: orderId,
        message: env.message || env.error_type || "cancel_failed",
      });
    }
  }

  return { cancelled, errors };
}
