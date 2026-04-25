import { NextRequest, NextResponse } from "next/server";
import { getMongoDbStatus } from "@/lib/mongodb-health";
import { getKiteAccessToken } from "@/lib/kite-session";

/**
 * GET /api/kite/mongodb-status — connectivity for dashboard banner.
 *
 * Auth: Kite session cookie, or `Authorization: Bearer <OPEN_ORDER_HISTORY_READ_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.OPEN_ORDER_HISTORY_READ_SECRET?.trim();
  const auth = req.headers.get("authorization");
  const bearerOk = Boolean(secret && auth === `Bearer ${secret}`);
  const cookieAt = await getKiteAccessToken();
  if (!cookieAt && !bearerOk) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const status = await getMongoDbStatus();
  return NextResponse.json(status);
}
