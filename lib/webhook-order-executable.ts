import { kiteGet } from "./kite-client";
import { getKiteInstrumentLotSize } from "./kite-instrument-lot";
import type { KitePlaceOrderBody } from "./kite-place-order";
import { sanitizeKiteTag, validateKitePlaceOrderBody } from "./kite-order-validate";

export type WebhookOrderExecutableResult =
  | { ok: true }
  | { ok: false; message: string; error_type: string };

/**
 * Confirms a webhook-mapped order can be sent to Kite: passes the same field validation as
 * {@link placeKiteOrder}, lot multiple from Kite instruments (cached), then GET /quote/ltp.
 */
export async function validateWebhookOrderExecutable(
  accessToken: string,
  body: KitePlaceOrderBody,
): Promise<WebhookOrderExecutableResult> {
  const v = validateKitePlaceOrderBody({
    ...body,
    tag: sanitizeKiteTag(body.tag),
  });
  if (!v.ok) {
    return {
      ok: false,
      message: v.message,
      error_type: v.error_type,
    };
  }

  const ex = String(v.formFields.exchange).toUpperCase();
  const sym = String(v.formFields.tradingsymbol).toUpperCase();
  const qty = v.formFields.quantity;

  try {
    if (typeof qty === "number") {
      const lot = await getKiteInstrumentLotSize(accessToken, ex, sym);
      if (lot != null && lot >= 1 && qty % lot !== 0) {
        return {
          ok: false,
          message: `quantity ${qty} is not a multiple of Kite lot_size ${lot} for ${ex}:${sym}`,
          error_type: "InputException",
        };
      }
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load Kite instruments for lot check";
    return {
      ok: false,
      message: msg,
      error_type: "NetworkException",
    };
  }

  const key = `${ex}:${sym}`;

  try {
    const data = await kiteGet<Record<string, { instrument_token?: unknown }>>(
      `/quote/ltp?i=${encodeURIComponent(key)}`,
      accessToken,
    );
    const row = data[key];
    const token = row?.instrument_token;
    if (typeof token !== "number" || !Number.isFinite(token)) {
      return {
        ok: false,
        message: `Instrument not found for ${key} (check exchange and symbol)`,
        error_type: "InstrumentException",
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Kite quote request failed";
    return {
      ok: false,
      message: msg,
      error_type: "NetworkException",
    };
  }

  return { ok: true };
}
