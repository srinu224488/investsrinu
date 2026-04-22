import { parseKitePostbackBody } from "./kite-postback-body";
import { verifyKitePostbackPayload } from "./kite-checksum";
import { appendWebhookEvent } from "./webhook-events";

/**
 * Zerodha Kite Connect postback: HTTPS URL where order status updates are POSTed.
 * @see https://kite.trade/docs/connect/v3/postbacks/
 */
export type KitePostbackResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function handleZerodhaKitePostback(
  rawBody: string,
): Promise<KitePostbackResult> {
  const secret = process.env.KITE_API_SECRET?.trim();
  const prod = process.env.NODE_ENV === "production";

  if (prod && !secret) {
    return { ok: false, status: 503, error: "webhook_misconfigured" };
  }

  const payload = parseKitePostbackBody(rawBody);
  if (payload === undefined) {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  if (secret && !verifyKitePostbackPayload(payload, secret)) {
    return { ok: false, status: 401, error: "invalid_checksum" };
  }

  await appendWebhookEvent(payload);
  return { ok: true };
}
