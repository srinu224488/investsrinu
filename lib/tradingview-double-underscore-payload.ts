/**
 * Plain-text TradingView alert body: five or seven fields separated by "__" (double underscore).
 * Five: {{ticker}}__{{strategy.order.action}}__{{strategy.order.price}}__{{interval}}__{{timenow}}
 * Seven: …__{{timenow}}__{{quantity}}__{{product}} — missing/blank quantity or product are ignored downstream (defaults).
 */
const DELIM = "__";
const PARTS_LEGACY = 5;
const PARTS_EXTENDED = 7;

export type TradingViewDoubleUnderscoreParts = {
  ticker: string;
  action: string;
  price: string;
  interval: string;
  timenow: string;
  /** Raw seventh-field segment when using the extended template; may be empty. */
  quantity?: string;
  /** Raw eighth-field segment when using the extended template; may be empty. */
  product?: string;
};

export function parseTradingViewDoubleUnderscoreLine(
  raw: string,
): TradingViewDoubleUnderscoreParts | null {
  const t = raw.replace(/^\uFEFF/, "").trim();
  if (!t) return null;
  const parts = t.split(DELIM);
  if (parts.length !== PARTS_LEGACY && parts.length !== PARTS_EXTENDED) return null;
  const [ticker, action, price, interval, timenow, qtyRaw, prodRaw] = parts.map((s) => s.trim());
  if (!ticker || !action) return null;
  const base = { ticker, action, price, interval, timenow };
  if (parts.length === PARTS_LEGACY) return base;
  return {
    ...base,
    quantity: qtyRaw,
    product: prodRaw,
  };
}
