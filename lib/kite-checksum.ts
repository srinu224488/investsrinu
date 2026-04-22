import { createHash, timingSafeEqual } from "crypto";

/** Kite Connect v3: SHA-256 hex of (api_key + request_token + api_secret). */
export function kiteSessionChecksum(
  apiKey: string,
  requestToken: string,
  apiSecret: string,
): string {
  return createHash("sha256")
    .update(apiKey + requestToken + apiSecret, "utf8")
    .digest("hex");
}

/** Postback: SHA-256 hex of (order_id + order_timestamp + api_secret). */
export function kitePostbackChecksum(
  orderId: string,
  orderTimestamp: string,
  apiSecret: string,
): string {
  return createHash("sha256")
    .update(orderId + orderTimestamp + apiSecret, "utf8")
    .digest("hex");
}

export function verifyKitePostbackPayload(
  payload: unknown,
  apiSecret: string,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const orderId = o.order_id;
  const ts = o.order_timestamp;
  const checksum = o.checksum;
  if (orderId == null || ts == null || typeof checksum !== "string") {
    return false;
  }
  const orderIdStr = String(orderId);
  const tsStr = String(ts);
  const expected = kitePostbackChecksum(orderIdStr, tsStr, apiSecret);
  const got = checksum.trim().toLowerCase();
  const want = expected.toLowerCase();
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(want, "utf8"), Buffer.from(got, "utf8"));
  } catch {
    return false;
  }
}
