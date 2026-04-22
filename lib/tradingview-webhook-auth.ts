import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTradingViewWebhookSecretResolved } from "./kite-webhook-access-token";

function secretMatches(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function webhookSecretFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return undefined;
  const v = (payload as Record<string, unknown>).webhook_secret;
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Remove `webhook_secret` from stored webhook bodies and order mapping input. */
export function stripWebhookSecretFromPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  const o = { ...(payload as Record<string, unknown>) };
  delete o.webhook_secret;
  return o;
}

/**
 * If a webhook secret is configured (env or Mongo `kite_webhook_access.webhookSecret`),
 * require `Authorization: Bearer <secret>` or JSON field `webhook_secret` with the same value.
 */
export async function tradingViewWebhookAuthResponse(
  req: NextRequest,
  payload: unknown,
): Promise<NextResponse | null> {
  const token = await getTradingViewWebhookSecretResolved();
  if (!token) return null;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${token}`) return null;

  const fromBody = webhookSecretFromPayload(payload);
  if (fromBody && secretMatches(fromBody, token)) return null;

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
