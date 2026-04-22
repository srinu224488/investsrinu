import {
  isKitePostbackWebhookEventBody,
  mapTradingViewBodyToKiteOrder,
} from "./tradingview-kite-order";
import { parseTradingViewDoubleUnderscoreLine } from "./tradingview-double-underscore-payload";

export type WebhookEventTableRow = {
  ticker: string;
  action: string;
  price: string;
  interval: string;
  timenow: string;
  /** Plain line or JSON for the Raw column */
  raw: string;
};

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t || undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function webhookBodyToTableRow(body: unknown): WebhookEventTableRow | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  if (isKitePostbackWebhookEventBody(o)) return null;

  const textLine = typeof o.text === "string" ? o.text : "";
  const fromText = textLine ? parseTradingViewDoubleUnderscoreLine(textLine) : null;
  if (fromText) {
    return {
      ticker: fromText.ticker,
      action: fromText.action,
      price: fromText.price || "—",
      interval: fromText.interval || "—",
      timenow: fromText.timenow || "—",
      raw: textLine,
    };
  }

  if (o._format === "tv_delimited") {
    const ticker = str(o.ticker) ?? "—";
    const action = str(o.action) ?? "—";
    const price = str(o.order_price) ?? str(o.price) ?? "—";
    const interval = str(o.interval) ?? "—";
    const timenow = str(o.timenow) ?? "—";
    const qty = num(o.quantity) ?? num(o.contracts);
    const prod = str(o.product);
    const base = `${ticker}__${action}__${price}__${interval}__${timenow}`;
    const raw =
      qty != null || prod ? `${base}__${qty ?? ""}__${prod ?? ""}` : base;
    return {
      ticker,
      action,
      price,
      interval,
      timenow,
      raw,
    };
  }

  if (mapTradingViewBodyToKiteOrder(body).ok) {
    const ticker = str(o.ticker) ?? "—";
    const action = str(o.action) ?? str(o.event) ?? "—";
    const p = str(o.order_price) ?? str(o.price) ?? str(o.ltp);
    return {
      ticker,
      action,
      price: p ?? "—",
      interval: "—",
      timenow: "—",
      raw: JSON.stringify(body),
    };
  }

  return null;
}
