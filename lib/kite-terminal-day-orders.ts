/** Day-book rows that are done (executed, cancelled, rejected, etc.). */
const TERMINAL_STATUS = new Set([
  "COMPLETE",
  "CANCELLED",
  "REJECTED",
  "CANCELLED AMO",
]);

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type TerminalDayOrderRow = {
  order_id: string;
  order_timestamp: string | null;
  transaction_type: string;
  tradingsymbol: string;
  exchange: string;
  product: string;
  quantity: number;
  filled_quantity: number;
  average_price: number;
  order_type: string;
  price: number;
  status: string;
  /** Kite client order tag (e.g. `tv` / `tv-strategy`) — use to tie rows to webhook-placed orders. */
  tag?: string;
};

export function isTerminalKiteOrderStatus(status: string): boolean {
  const u = str(status).toUpperCase();
  return u !== "" && TERMINAL_STATUS.has(u);
}

function rowFromKite(o: Record<string, unknown>): TerminalDayOrderRow | null {
  const order_id = str(o.order_id);
  if (!order_id) return null;
  const st = str(o.status);
  if (!isTerminalKiteOrderStatus(st)) return null;
  const tagRaw = str(o.tag);
  return {
    order_id,
    order_timestamp: str(o.order_timestamp) || null,
    transaction_type: str(o.transaction_type).toUpperCase() || "—",
    tradingsymbol: str(o.tradingsymbol).toUpperCase() || "—",
    exchange: str(o.exchange).toUpperCase() || "—",
    product: str(o.product).toUpperCase() || "—",
    quantity: num(o.quantity),
    filled_quantity: num(o.filled_quantity),
    average_price: num(o.average_price),
    order_type: str(o.order_type).toUpperCase() || "—",
    price: num(o.price),
    status: st || "—",
    ...(tagRaw ? { tag: tagRaw } : {}),
  };
}

export function terminalDayOrdersFromKiteList(
  orders: unknown[],
): TerminalDayOrderRow[] {
  const out: TerminalDayOrderRow[] = [];
  if (!Array.isArray(orders)) return out;
  for (const raw of orders) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = rowFromKite(raw as Record<string, unknown>);
    if (row) out.push(row);
  }
  out.sort((a, b) => {
    const ta = a.order_timestamp || "";
    const tb = b.order_timestamp || "";
    return tb.localeCompare(ta);
  });
  return out;
}
