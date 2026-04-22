import { NextRequest, NextResponse } from "next/server";
import { listOpenOrderHistoryPage } from "@/lib/open-order-history";
import { getKiteAccessToken } from "@/lib/kite-session";

/**
 * GET /api/kite/open-order-history — paginated snapshots of the Kite “open” order book.
 *
 * Auth: Kite session cookie, or `Authorization: Bearer <OPEN_ORDER_HISTORY_READ_SECRET>` when set.
 *
 * Query: `limit` (default 30, max 100), `offset` (default 0), newest first.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.OPEN_ORDER_HISTORY_READ_SECRET?.trim();
  const auth = req.headers.get("authorization");
  const bearerOk = secret && auth === `Bearer ${secret}`;
  const cookieAt = await getKiteAccessToken();
  if (!cookieAt && !bearerOk) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = await listOpenOrderHistoryPage({
    limit: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    offset: searchParams.has("offset")
      ? Number(searchParams.get("offset"))
      : undefined,
  });

  return NextResponse.json(page);
}
