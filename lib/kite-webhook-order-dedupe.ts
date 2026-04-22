import type { KitePlaceOrderBody } from "./kite-place-order";
import { isTerminalKiteOrderStatus } from "./kite-terminal-day-orders";

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

function hasWorkingQuantity(o: Record<string, unknown>): boolean {
  const pending = num(o.pending_quantity);
  if (pending !== undefined && pending <= 0) return false;
  return true;
}

export type ExistingSameSideOrder = {
  order_id: string;
  status: string;
};

/**
 * Find a non-terminal day-book order for the same ticker (exchange + tradingsymbol),
 * product, and side as the webhook intent (used for diagnostics; TradingView webhook
 * placement cancels same-side pendings before placing instead of skipping).
 */
export function findOpenSameSideOrderForProductAndTicker(
  orders: unknown[],
  fields: KitePlaceOrderBody,
): ExistingSameSideOrder | null {
  const ex = normUpper(fields.exchange);
  const sym = normUpper(fields.tradingsymbol);
  const prod = normUpper(fields.product);
  const tx = normUpper(fields.transaction_type);
  if (!ex || !sym || !prod || !tx) return null;

  if (!Array.isArray(orders)) return null;
  for (const row of orders) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    if (normUpper(o.tradingsymbol) !== sym) continue;
    if (normUpper(o.product) !== prod) continue;
    if (normUpper(o.exchange) !== ex) continue;
    if (normUpper(o.transaction_type) !== tx) continue;

    const st = str(o.status);
    if (!st || isTerminalKiteOrderStatus(st)) continue;
    if (!hasWorkingQuantity(o)) continue;

    const orderId = str(o.order_id);
    if (!orderId) continue;
    return { order_id: orderId, status: st };
  }
  return null;
}
