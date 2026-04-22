import { NextRequest, NextResponse } from "next/server";
import { kiteGet } from "@/lib/kite-client";
import { getKiteAccessToken } from "@/lib/kite-session";
import {
  listWebhookPlacementLogPage,
  type WebhookPlacementLogRow,
} from "@/lib/webhook-placement-log";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

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

export type AutomatedOrderListRow = WebhookPlacementLogRow & {
  kite_live_status?: string;
  kite_filled_quantity?: number;
  kite_pending_quantity?: number;
};

function liveStatusMapFromKiteOrders(
  orders: unknown[],
): Map<string, { status: string; filled: number; pending: number }> {
  const m = new Map<string, { status: string; filled: number; pending: number }>();
  if (!Array.isArray(orders)) return m;
  for (const raw of orders) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.order_id);
    if (!id) continue;
    const st = str(o.status) || "—";
    m.set(id, {
      status: st,
      filled: num(o.filled_quantity) ?? 0,
      pending: num(o.pending_quantity) ?? 0,
    });
  }
  return m;
}

/**
 * GET /api/kite/automated-orders — TradingView webhook placement attempts with optional live Kite status.
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

  const sp = new URL(req.url).searchParams;
  const limit = numParam(sp, "limit", 50, 200);
  const offset = offParam(sp, "offset");

  const page = await listWebhookPlacementLogPage({
    limit,
    offset,
    requireTradingsymbol: true,
  });

  let liveById = new Map<string, { status: string; filled: number; pending: number }>();
  if (cookieAt) {
    try {
      const orders = await kiteGet<unknown[]>("/orders", cookieAt);
      liveById = liveStatusMapFromKiteOrders(orders ?? []);
    } catch {
      // list still useful without live enrichment
    }
  }

  const rows: AutomatedOrderListRow[] = page.rows.map((r) => {
    if (!r.order_id) return { ...r };
    const live = liveById.get(r.order_id);
    if (!live) return { ...r };
    return {
      ...r,
      kite_live_status: live.status,
      kite_filled_quantity: live.filled,
      kite_pending_quantity: live.pending,
    };
  });

  return NextResponse.json({
    rows,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    storage: page.storage,
    database: page.database,
    collection: page.collection,
    kite_live_enriched: Boolean(cookieAt),
  });
}
