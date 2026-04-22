import { NextRequest, NextResponse } from "next/server";
import { kiteGet } from "@/lib/kite-client";
import {
  terminalDayOrdersFromKiteList,
  type TerminalDayOrderRow,
} from "@/lib/kite-terminal-day-orders";
import { listOpenOrderHistoryPage } from "@/lib/open-order-history";
import { webhookEventsToOrderIntents } from "@/lib/webhook-event-order-intent";
import { listWebhookEventsPage } from "@/lib/webhook-events";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
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
 * GET /api/kite/orderflow — snapshots, webhook intents, and today’s executed/closed rows from Kite (when session cookie present).
 *
 * Auth: Kite session cookie, or `Authorization: Bearer <OPEN_ORDER_HISTORY_READ_SECRET>`.
 *
 * Query: `snap_limit` (default 40, max 100), `snap_offset`, `events_limit` (default 50, max 200), `events_offset`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.OPEN_ORDER_HISTORY_READ_SECRET?.trim();
  const auth = req.headers.get("authorization");
  const bearerOk = secret && auth === `Bearer ${secret}`;
  const cookieAt = await getKiteAccessToken();
  if (!cookieAt && !bearerOk) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const snapLimit = numParam(sp, "snap_limit", 40, 100);
  const snapOffset = offParam(sp, "snap_offset");
  const eventsLimit = numParam(sp, "events_limit", 50, 200);
  const eventsOffset = offParam(sp, "events_offset");

  const [snapPage, eventsPage] = await Promise.all([
    listOpenOrderHistoryPage({ limit: snapLimit, offset: snapOffset }),
    listWebhookEventsPage({ limit: eventsLimit, offset: eventsOffset }),
  ]);

  const webhook_order_intents = webhookEventsToOrderIntents(eventsPage.events);

  let terminal_day_orders: TerminalDayOrderRow[] = [];
  let kite_day_orders_error: string | undefined;
  if (cookieAt) {
    try {
      const all = await kiteGet<unknown[]>("/orders", cookieAt);
      void persistKiteAccessTokenForWebhook(cookieAt);
      terminal_day_orders = terminalDayOrdersFromKiteList(all ?? []);
    } catch (e) {
      kite_day_orders_error =
        e instanceof Error ? e.message : "kite_orders_failed";
    }
  }

  return NextResponse.json({
    snapshots: snapPage.snapshots,
    snapshot_meta: {
      total: snapPage.total,
      limit: snapPage.limit,
      offset: snapPage.offset,
      storage: snapPage.storage,
      database: snapPage.database,
      collection: snapPage.collection,
    },
    webhook_order_intents,
    webhook_meta: {
      total: eventsPage.total,
      limit: eventsPage.limit,
      offset: eventsPage.offset,
      storage: eventsPage.storage,
      database: eventsPage.database,
      collection: eventsPage.collection,
    },
    terminal_day_orders,
    kite_day_orders_error,
  });
}
