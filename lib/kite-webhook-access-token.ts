import { getMongoDb } from "./mongodb";
import { getKiteAccessTokenFromEnv } from "./kite-session";

const COLLECTION = "kite_webhook_access";
const DOC_KEY = "default";

/**
 * Shared secret for TradingView POSTs: no custom headers on TV alerts.
 * 1) `TRADINGVIEW_WEBHOOK_SECRET` env when set (wins over Mongo).
 * 2) Else optional `webhookSecret` on the `kite_webhook_access` doc (`key: "default"`).
 *
 * When non-empty, requests must send `Authorization: Bearer <secret>` or a JSON field
 * `webhook_secret` (stripped before events are stored).
 */
export async function getTradingViewWebhookSecretResolved(): Promise<string | null> {
  const fromEnv = process.env.TRADINGVIEW_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;
  try {
    const db = await getMongoDb();
    if (!db) return null;
    const doc = await db
      .collection(COLLECTION)
      .findOne<{ webhookSecret?: unknown }>({ key: DOC_KEY });
    const s = doc?.webhookSecret;
    if (typeof s === "string" && s.trim()) return s.trim();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Token for server-side TradingView webhooks: no browser cookie on those requests.
 * 1) `KITE_ACCESS_TOKEN` env when set (highest priority).
 * 2) Else token persisted in MongoDB when you complete Kite OAuth (same DB as webhooks).
 */
export async function getKiteAccessTokenForWebhook(): Promise<string | null> {
  const fromEnv = getKiteAccessTokenFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const db = await getMongoDb();
    if (!db) return null;
    const doc = await db
      .collection(COLLECTION)
      .findOne<{ token?: unknown }>({ key: DOC_KEY });
    const t = doc?.token;
    if (typeof t === "string" && t.trim()) return t.trim();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Called after successful Kite OAuth so TradingView webhooks can place orders without `KITE_ACCESS_TOKEN`.
 */
export async function persistKiteAccessTokenForWebhook(
  accessToken: string,
): Promise<void> {
  const t = accessToken?.trim();
  if (!t) return;
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection(COLLECTION).updateOne(
      { key: DOC_KEY },
      { $set: { key: DOC_KEY, token: t, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch {
    // ignore — login still succeeds via cookie
  }
}
