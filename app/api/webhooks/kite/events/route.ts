import { NextResponse } from "next/server";
import { listWebhookEventsPage } from "@/lib/webhook-events";

/** Always read latest rows from storage (no static caching). */
export const dynamic = "force-dynamic";

/** @deprecated Prefer GET /api/webhooks/events — same data, `{ events }` only for older clients. */
export async function GET() {
  const page = await listWebhookEventsPage({ limit: 200, offset: 0 });
  return NextResponse.json(
    { events: page.events },
    {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
      },
    },
  );
}
