import { NextRequest, NextResponse } from "next/server";
import { listOrderFlowLogPage } from "@/lib/order-flow-log";
import { getKiteAccessToken } from "@/lib/kite-session";

function numParam(
  sp: URLSearchParams,
  key: string,
  fallback: number,
  max: number,
): number {
  const raw = sp.get(key);
  if (raw === null || raw === "") return fallback;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function offParam(sp: URLSearchParams, key: string): number {
  const raw = sp.get(key);
  if (raw === null || raw === "") return 0;
  const n = Math.floor(Number(raw));
  return !Number.isFinite(n) || n < 0 ? 0 : n;
}

/**
 * GET /api/kite/order-flow-log — paginated order flow log steps.
 *
 * Auth: Kite session cookie, or `Authorization: Bearer <OPEN_ORDER_HISTORY_READ_SECRET>`.
 * Query: `limit` (default 50, max 200), `offset`, `webhook_event_id` (optional filter).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.OPEN_ORDER_HISTORY_READ_SECRET?.trim();
  const auth = req.headers.get("authorization");
  const bearerOk = Boolean(secret && auth === `Bearer ${secret}`);
  const cookieAt = await getKiteAccessToken();
  if (!cookieAt && !bearerOk) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const limit = numParam(sp, "limit", 50, 200);
  const offset = offParam(sp, "offset");
  const webhook_event_id = sp.get("webhook_event_id") ?? undefined;

  const page = await listOrderFlowLogPage({ limit, offset, webhook_event_id });
  return NextResponse.json(page);
}
