import type { KitePlaceOrderBody } from "./kite-place-order";
import { sanitizeKiteTag } from "./kite-order-validate";
import { parseTradingViewDoubleUnderscoreLine } from "./tradingview-double-underscore-payload";

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

function normalizeSide(raw: string): "BUY" | "SELL" | undefined {
  const u = raw.trim().toUpperCase();
  if (u === "BUY" || u === "B" || u === "LONG") return "BUY";
  if (u === "SELL" || u === "S" || u === "SHORT") return "SELL";
  return undefined;
}

function parseTickerExchange(
  ticker: string,
  fallbackExchange?: string,
): { exchange: string; tradingsymbol: string } | undefined {
  const t = ticker.trim();
  const colon = t.indexOf(":");
  if (colon > 0) {
    const ex = t.slice(0, colon).trim().toUpperCase();
    const sym = t.slice(colon + 1).trim();
    if (ex && sym) return { exchange: ex, tradingsymbol: sym };
  }
  const ex = (fallbackExchange || "NSE").trim().toUpperCase();
  if (t && ex) return { exchange: ex, tradingsymbol: t.toUpperCase() };
  return undefined;
}

/**
 * MCX / NFO: NRML. Other exchanges: explicit `product` if present, else
 * `KITE_TV_WEBHOOK_DEFAULT_PRODUCT` (e.g. CNC), or MIS — so TV delimited / minimal JSON works without `product`.
 */
function productForExchange(exchange: string, explicitProduct: string | undefined): string {
  if (exchange === "MCX" || exchange === "NFO") return "NRML";
  const p = explicitProduct?.trim();
  if (p) return p.toUpperCase();
  const fromEnv = process.env.KITE_TV_WEBHOOK_DEFAULT_PRODUCT?.trim();
  if (fromEnv) return fromEnv.toUpperCase();
  return "MIS";
}

/**
 * Map TradingView alert JSON (or Kite-shaped JSON) to Kite Connect place-order fields.
 * Supports pass-through when body already has tradingsymbol, transaction_type, quantity, product, order_type.
 * TV-style alerts (`ticker` + `action`/`event`): `contracts` / `position_size` / `quantity` default to 1 when omitted.
 * `product` optional: MCX/NFO → NRML; otherwise defaults to MIS (override with `KITE_TV_WEBHOOK_DEFAULT_PRODUCT` or `product` in JSON).
 * `action`/`event`: BUY/B/LONG → long (BUY), SELL/S/SHORT → short (SELL) on Kite.
 */
export function mapTradingViewBodyToKiteOrder(
  body: unknown,
):
  | { ok: true; fields: KitePlaceOrderBody }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "not_an_object" };
  }
  const o = body as Record<string, unknown>;

  if (o.place === false || o.execute === false || o.dry_run === true) {
    return { ok: false, reason: "skipped_by_flag" };
  }

  const directSymbol = str(o.tradingsymbol);
  const directTx = str(o.transaction_type);
  const directQty = num(o.quantity);
  const directExchange = (str(o.exchange) || "NSE").toUpperCase();
  const directProductResolved = productForExchange(directExchange, str(o.product));
  const directOrderType = str(o.order_type);
  if (directSymbol && directTx && directProductResolved && directOrderType && directQty != null) {
    if (directQty <= 0) return { ok: false, reason: "invalid_quantity" };
    const side = normalizeSide(directTx);
    if (!side) return { ok: false, reason: "invalid_transaction_type" };
    const ot = directOrderType.toUpperCase();
    const price = num(o.price);
    const trigger_price = num(o.trigger_price);
    if ((ot === "LIMIT" || ot === "SL") && price == null) {
      return { ok: false, reason: "limit_requires_price" };
    }
    if (ot === "SL-M" && trigger_price == null) {
      return { ok: false, reason: "slm_requires_trigger" };
    }
    const mp = num(o.market_protection);
    const market_protection =
      ot === "MARKET" || ot === "SL-M" ? (mp != null ? mp : -1) : undefined;
    return {
      ok: true,
      fields: {
        variety: str(o.variety),
        exchange: directExchange,
        tradingsymbol: directSymbol.toUpperCase(),
        transaction_type: side,
        quantity: Math.floor(directQty),
        product: directProductResolved,
        order_type: ot,
        price: price ?? undefined,
        trigger_price: trigger_price ?? undefined,
        market_protection,
        validity: str(o.validity),
        tag: sanitizeKiteTag(str(o.tag)),
      },
    };
  }

  const tickerRaw = str(o.ticker);
  if (!tickerRaw) return { ok: false, reason: "missing_ticker_or_tradingsymbol" };

  const exFromBody = str(o.exchange);
  const parsed = parseTickerExchange(tickerRaw, exFromBody);
  if (!parsed) return { ok: false, reason: "invalid_ticker" };

  const actionRaw = str(o.action) ?? str(o.event);
  if (!actionRaw) return { ok: false, reason: "missing_action_or_event" };
  const side = normalizeSide(actionRaw);
  if (!side) return { ok: false, reason: "invalid_action" };

  const rawQty = num(o.contracts) ?? num(o.position_size) ?? num(o.quantity);
  if (rawQty != null && rawQty <= 0) return { ok: false, reason: "invalid_quantity" };
  const qty = rawQty != null && rawQty > 0 ? rawQty : 1;

  const product = productForExchange(parsed.exchange, str(o.product));
  // TradingView webhook path should execute as market orders; order_price is
  // informational for logs/table display and is not used for placement.
  const order_type = "MARKET";
  const mpTv = num(o.market_protection);
  const market_protection =
    order_type === "MARKET" ? (mpTv != null ? mpTv : -1) : undefined;

  const strategy = str(o.strategy);
  const tag =
    sanitizeKiteTag(str(o.tag)) ??
    (strategy ? sanitizeKiteTag(`tv-${strategy}`) : undefined) ??
    "tv";

  return {
    ok: true,
    fields: {
      exchange: parsed.exchange,
      tradingsymbol: parsed.tradingsymbol,
      transaction_type: side,
      quantity: Math.floor(qty),
      product,
      order_type,
      price: undefined,
      market_protection,
      validity: str(o.validity) || "DAY",
      tag,
    },
  };
}

/** Human-readable `message` for Kite-style `InputException` when TV mapping fails. */
export function tradingViewOrderMapFailureMessage(reason: string): string {
  const m: Record<string, string> = {
    not_an_object: "Request body must be a JSON object",
    skipped_by_flag: "Order skipped (place/execute/dry_run flag)",
    invalid_quantity: "Invalid quantity",
    invalid_transaction_type: "transaction_type must be BUY or SELL",
    limit_requires_price: "LIMIT or SL order_type requires price",
    slm_requires_trigger: "SL-M order_type requires trigger_price",
    missing_ticker_or_tradingsymbol: "Missing ticker or tradingsymbol",
    invalid_ticker: "Could not parse ticker / exchange",
    missing_action_or_event: "Missing action or event (BUY/SELL)",
    invalid_action: "action/event must be BUY, SELL, LONG, or SHORT",
    missing_or_invalid_quantity: "Missing or invalid contracts/position_size/quantity",
    missing_product: "Missing product (e.g. MIS, CNC, NRML)",
  };
  return m[reason] ?? reason;
}

export function isKitePostbackWebhookEventBody(o: Record<string, unknown>): boolean {
  const checksum = o.checksum;
  if (typeof checksum === "string" && checksum.trim().length >= 32) {
    return /^[a-f0-9]+$/i.test(checksum.trim());
  }
  const oid = o.order_id;
  const uid = o.user_id ?? o.placed_by;
  if (
    typeof oid === "string" &&
    oid.trim() !== "" &&
    typeof uid === "string" &&
    uid.trim() !== ""
  ) {
    return (
      typeof o.exchange === "string" &&
      typeof o.tradingsymbol === "string" &&
      o.ticker === undefined
    );
  }
  return false;
}

/**
 * Dashboard webhook table: TradingView plain text (`ticker__…__timenow`), alert JSON, or direct Kite fields.
 * Kite HTTPS postbacks are stored but hidden here.
 */
export function isTradingViewWebhookEventBodyForTable(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const o = body as Record<string, unknown>;
  if (isKitePostbackWebhookEventBody(o)) return false;
  if (o._format === "tv_delimited") return true;
  const text = str(o.text);
  if (text && parseTradingViewDoubleUnderscoreLine(text)) return true;
  return mapTradingViewBodyToKiteOrder(body).ok;
}
