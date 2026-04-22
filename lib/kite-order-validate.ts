import type { KitePlaceOrderBody } from "./kite-place-order";

const VARIETIES = new Set([
  "regular",
  "amo",
  "co",
  "iceberg",
  "auction",
]);
const EXCHANGES = new Set(["NSE", "BSE", "NFO", "CDS", "BCD", "MCX"]);
const PRODUCTS = new Set(["CNC", "MIS", "NRML", "MTF", "BO", "CO"]);
const ORDER_TYPES = new Set(["MARKET", "LIMIT", "SL", "SL-M"]);
const TRANSACTION_TYPES = new Set(["BUY", "SELL"]);
const VALIDITY = new Set(["DAY", "IOC"]);

const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * Kite `tag`: alphanumeric + hyphen only, max 20 (InputException otherwise).
 * Normalizes Unicode, strips invalid chars, collapses hyphens, requires at least one letter/digit.
 */
export function sanitizeKiteTag(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  let t = String(raw).trim();
  if (!t) return undefined;
  try {
    t = t.normalize("NFKC");
  } catch {
    /* ignore */
  }
  let s = t.replace(/[^A-Za-z0-9-]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!s || !/[A-Za-z0-9]/.test(s)) return undefined;
  s = s.slice(0, 20).replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!s || !/[A-Za-z0-9]/.test(s)) return undefined;
  return s.toLowerCase();
}

type Validated = {
  ok: true;
  variety: string;
  formFields: Record<string, string | number>;
};

type Invalid = {
  ok: false;
  message: string;
  error_type: "InputException";
};

function invalid(message: string): Invalid {
  return { ok: false, message, error_type: "InputException" };
}

/**
 * Validates place-order fields per Kite Connect v3 regular order parameters
 * before calling POST /orders/:variety.
 */
export function validateKitePlaceOrderBody(
  body: KitePlaceOrderBody,
): Validated | Invalid {
  const variety = (body.variety || "regular").toLowerCase();
  if (!VARIETIES.has(variety)) {
    return invalid(`Invalid variety: ${body.variety || "(empty)"}`);
  }

  const exchange = (body.exchange || "NSE").toUpperCase();
  if (!EXCHANGES.has(exchange)) {
    return invalid(`Invalid exchange: ${exchange}`);
  }

  const tradingsymbol = body.tradingsymbol?.trim() ?? "";
  if (!tradingsymbol) {
    return invalid("tradingsymbol is required");
  }
  if (!SYMBOL_RE.test(tradingsymbol)) {
    return invalid("tradingsymbol has invalid characters");
  }

  const transaction_type = (body.transaction_type || "").toUpperCase();
  if (!TRANSACTION_TYPES.has(transaction_type)) {
    return invalid("transaction_type must be BUY or SELL");
  }

  const qtyRaw = body.quantity;
  if (qtyRaw == null || typeof qtyRaw !== "number" || !Number.isFinite(qtyRaw)) {
    return invalid("quantity must be a finite number");
  }
  const quantity = Math.floor(qtyRaw);
  if (quantity < 1) {
    return invalid("quantity must be at least 1");
  }

  const product = (body.product || "").toUpperCase();
  if (!PRODUCTS.has(product)) {
    return invalid(`Invalid product: ${body.product || "(empty)"}`);
  }

  const order_type = (body.order_type || "").toUpperCase();
  if (!ORDER_TYPES.has(order_type)) {
    return invalid(`Invalid order_type: ${body.order_type || "(empty)"}`);
  }

  const validity = (body.validity || "DAY").toUpperCase();
  if (!VALIDITY.has(validity)) {
    return invalid(`Invalid validity: ${validity} (use DAY or IOC)`);
  }

  const price =
    body.price != null && Number.isFinite(body.price) ? body.price : undefined;
  const trigger_price =
    body.trigger_price != null && Number.isFinite(body.trigger_price)
      ? body.trigger_price
      : undefined;

  if (order_type === "LIMIT") {
    if (price == null || price <= 0) {
      return invalid("LIMIT orders require a positive price");
    }
  }
  if (order_type === "SL") {
    if (trigger_price == null || trigger_price <= 0) {
      return invalid("SL orders require a positive trigger_price");
    }
    if (price == null || price <= 0) {
      return invalid("SL orders require a positive price");
    }
  }
  if (order_type === "SL-M") {
    if (trigger_price == null || trigger_price <= 0) {
      return invalid("SL-M orders require a positive trigger_price");
    }
  }
  if (order_type === "MARKET") {
    /* price/trigger optional; Kite ignores for pure market */
  }

  let market_protection: number | undefined;
  if (order_type === "MARKET" || order_type === "SL-M") {
    const raw = body.market_protection;
    let mp: number;
    if (raw == null) {
      mp = -1;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      mp = Math.floor(raw);
    } else if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw.trim());
      if (!Number.isFinite(n)) {
        return invalid("market_protection must be a number (-1, 0, or 1–100)");
      }
      mp = Math.floor(n);
    } else {
      return invalid("market_protection must be a number (-1, 0, or 1–100)");
    }
    if (mp !== -1 && mp !== 0 && (mp < 1 || mp > 100)) {
      return invalid("market_protection must be -1 (auto), 0 (none), or 1–100");
    }
    market_protection = mp;
  }

  const formFields: Record<string, string | number> = {
    exchange,
    tradingsymbol: tradingsymbol.toUpperCase(),
    transaction_type,
    quantity,
    product,
    order_type,
    validity,
  };

  if (price != null) formFields.price = price;
  if (trigger_price != null) formFields.trigger_price = trigger_price;
  if (market_protection != null) formFields.market_protection = market_protection;
  const tagSanitized = sanitizeKiteTag(body.tag);
  if (tagSanitized) {
    formFields.tag = tagSanitized;
  }

  return { ok: true, variety, formFields };
}
