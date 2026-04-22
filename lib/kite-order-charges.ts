import { kitePostJson } from "./kite-client";

export type OrderLike = Record<string, unknown>;

type ChargesOrderPayload = {
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  transaction_type: string;
  variety: string;
  product: string;
  order_type: string;
  quantity: number;
  average_price: number;
};

type ChargesRow = {
  tradingsymbol?: string;
  charges?: { total?: number };
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toChargesPayload(o: OrderLike): ChargesOrderPayload | null {
  const average_price = num(o.average_price);
  if (!(average_price > 0)) return null;
  const quantity = num(o.filled_quantity) > 0 ? num(o.filled_quantity) : num(o.quantity);
  if (!(quantity > 0)) return null;
  const order_id = String(o.order_id ?? "").trim();
  const exchange = String(o.exchange ?? "").trim();
  const tradingsymbol = String(o.tradingsymbol ?? "").trim();
  const transaction_type = String(o.transaction_type ?? "").trim();
  const product = String(o.product ?? "").trim();
  const order_type = String(o.order_type ?? "").trim();
  if (!order_id || !exchange || !tradingsymbol || !transaction_type || !product || !order_type) {
    return null;
  }
  return {
    order_id,
    exchange,
    tradingsymbol,
    transaction_type,
    variety: String(o.variety ?? "regular").trim() || "regular",
    product,
    order_type,
    quantity,
    average_price,
  };
}

/** Per-symbol charge split from `/charges/orders` (aligned with request order rows). */
export type SymbolChargeBreakdown = {
  buy: number;
  sell: number;
  /** Non-BUY/SELL sides (rare), included in `total`. */
  other: number;
  total: number;
};

/** POST /charges/orders for executed orders, then sum `charges.total` per tradingsymbol and side. */
export async function aggregateChargesBySymbol(
  orders: OrderLike[],
  accessToken: string,
): Promise<Record<string, SymbolChargeBreakdown>> {
  const payloads = orders
    .map((o) => toChargesPayload(o))
    .filter((p): p is ChargesOrderPayload => p !== null);
  if (payloads.length === 0) return {};

  const chunkSize = 40;
  const totals: Record<string, SymbolChargeBreakdown> = {};

  const bump = (
    sym: string,
    side: string,
    amount: number,
  ): void => {
    if (!totals[sym]) {
      totals[sym] = { buy: 0, sell: 0, other: 0, total: 0 };
    }
    const b = totals[sym];
    b.total += amount;
    const u = side.trim().toUpperCase();
    if (u === "BUY") b.buy += amount;
    else if (u === "SELL") b.sell += amount;
    else b.other += amount;
  };

  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const data = await kitePostJson<ChargesRow[]>(
      "/charges/orders",
      accessToken,
      chunk,
    );
    const rows = data ?? [];
    for (let j = 0; j < chunk.length; j++) {
      const payload = chunk[j];
      const row = rows[j];
      const sym = (row?.tradingsymbol ?? payload.tradingsymbol).trim();
      const t = row?.charges?.total;
      if (!sym || typeof t !== "number" || !Number.isFinite(t)) continue;
      bump(sym, payload.transaction_type, t);
    }
  }

  return totals;
}
