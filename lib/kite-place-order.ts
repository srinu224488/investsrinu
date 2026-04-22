import type { KiteEnvelope, KitePlaceOrderData } from "./kite-api-envelope";
import { kitePostFormEnvelope } from "./kite-client";
import {
  sanitizeKiteTag,
  validateKitePlaceOrderBody,
} from "./kite-order-validate";

export type KitePlaceOrderBody = {
  variety?: string;
  exchange?: string;
  tradingsymbol?: string;
  transaction_type?: string;
  quantity?: number;
  product?: string;
  order_type?: string;
  price?: number;
  trigger_price?: number;
  /** MARKET / SL-M: Kite expects -1 (auto), 0 (none), or 1–100 (%). Omitted → -1. */
  market_protection?: number | string;
  validity?: string;
  tag?: string;
};

/**
 * Validates the payload, then POSTs to Kite. Returns the same JSON envelope Kite uses
 * (`status` + `data` or `message` + `error_type`).
 */
export async function placeKiteOrder(
  accessToken: string,
  body: KitePlaceOrderBody,
): Promise<KiteEnvelope<KitePlaceOrderData>> {
  const v = validateKitePlaceOrderBody({
    ...body,
    tag: sanitizeKiteTag(body.tag),
  });
  if (!v.ok) {
    return {
      status: "error",
      message: v.message,
      error_type: v.error_type,
    };
  }
  return kitePostFormEnvelope<KitePlaceOrderData>(
    `/orders/${v.variety}`,
    accessToken,
    v.formFields,
  );
}
