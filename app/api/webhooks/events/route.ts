import { NextRequest, NextResponse } from "next/server";
import { listWebhookEventsPage } from "@/lib/webhook-events";

/**
 * GET /api/webhooks/events — paginated `webhook_events` for review.
 *
 * Query: `limit` (default 50, max 200), `offset` (default 0), newest first.
 * Optional: `Authorization: Bearer <WEBHOOK_EVENTS_READ_SECRET>` when that env var is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.WEBHOOK_EVENTS_READ_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const page = await listWebhookEventsPage({
    limit: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    offset: searchParams.has("offset")
      ? Number(searchParams.get("offset"))
      : undefined,
  });

  return NextResponse.json(page);
}
