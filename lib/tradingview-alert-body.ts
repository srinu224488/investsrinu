/**
 * POST `/api/webhooks/tradingview`: JSON object, or plain text with five fields separated by `__`:
 * `{{ticker}}__{{strategy.order.action}}__{{strategy.order.price}}__{{interval}}__{{timenow}}` and optionally `__{{quantity}}__{{product}}` (defaults if omitted or blank).
 *
 * For JSON, alert message must be valid JSON after TradingView replaces `{{…}}` placeholders.
 * Use quoted placeholders for strings, e.g. `"exchange": "{{exchange}}"`, not `"exchange":{{exchange}}`.
 */
import { parseTradingViewDoubleUnderscoreLine } from "./tradingview-double-underscore-payload";

function tradingViewDelimitedToRecord(
  parts: NonNullable<ReturnType<typeof parseTradingViewDoubleUnderscoreLine>>,
) {
  const qtyStr = parts.quantity?.trim();
  let quantity: number | undefined;
  if (qtyStr) {
    const n = Number(qtyStr);
    if (Number.isFinite(n) && n > 0) quantity = Math.floor(n);
  }
  const product = parts.product?.trim() || undefined;

  return {
    _format: "tv_delimited" as const,
    ticker: parts.ticker,
    action: parts.action,
    order_price: parts.price,
    interval: parts.interval,
    timenow: parts.timenow,
    ...(quantity != null ? { quantity } : {}),
    ...(product ? { product } : {}),
  };
}

export type TradingViewAlertBody = {
  strategy?: string;
  event?: string;
  action?: string;
  contracts?: number;
  ticker?: string;
  position_size?: number;
  exchange?: string;
  ltp?: number;
  order_price?: number;
  volume?: number;
  /** Kite: CNC | MIS | NRML (and BO/CO where applicable). */
  product?: string;
};

/** Keys where TradingView often emits bare words if `{{…}}` was not wrapped in quotes in the alert. */
const BARE_WORD_JSON_KEYS = [
  "exchange",
  "ticker",
  "event",
  "action",
  "product",
] as const;

function quoteBareWordValues(json: string): string {
  let s = json;
  for (const key of BARE_WORD_JSON_KEYS) {
    const re = new RegExp(
      `("${key}"\\s*:\\s*)([A-Za-z][A-Za-z0-9_.-]*)(?=\\s*[,}])`,
      "g",
    );
    s = s.replace(re, '$1"$2"');
  }
  return s;
}

/**
 * Parse alert body: strict JSON, then light repair, then five- or seven-part `__` plain text, then `{ text }`.
 */
export function parseTradingViewWebhookPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tryJson = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return undefined;
    }
  };

  let v = tryJson(trimmed);
  if (v === undefined) {
    v = tryJson(quoteBareWordValues(trimmed));
  }
  if (v === undefined) {
    const d = parseTradingViewDoubleUnderscoreLine(trimmed);
    if (d) return tradingViewDelimitedToRecord(d);
    return { text: trimmed };
  }
  if (typeof v === "string") {
    const inner = tryJson(v) ?? tryJson(quoteBareWordValues(v));
    if (inner !== undefined) return inner;
    const d =
      parseTradingViewDoubleUnderscoreLine(v) ??
      parseTradingViewDoubleUnderscoreLine(trimmed);
    if (d) return tradingViewDelimitedToRecord(d);
    return { text: trimmed };
  }
  return v;
}
