import { NextRequest, NextResponse } from "next/server";
import { kiteGet } from "@/lib/kite-client";
import {
  aggregateChargesBySymbol,
  type OrderLike,
  type SymbolChargeBreakdown,
} from "@/lib/kite-order-charges";
import { persistOpenOrderSnapshot } from "@/lib/open-order-history";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import { getKiteAccessToken } from "@/lib/kite-session";

export async function GET(req: NextRequest) {
  const token = await getKiteAccessToken();
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  try {
    const orders = await kiteGet<unknown[]>("/orders", token);
    void persistKiteAccessTokenForWebhook(token);
    const list = orders ?? [];
    if (req.nextUrl.searchParams.get("save_open_history") === "1") {
      await persistOpenOrderSnapshot("dashboard_refresh", list);
    }
    const withCharges = req.nextUrl.searchParams.get("charges") === "1";
    if (!withCharges) {
      return NextResponse.json({ orders: list });
    }
    let chargeTotals: Record<string, SymbolChargeBreakdown> = {};
    let chargesError: string | undefined;
    try {
      chargeTotals = await aggregateChargesBySymbol(list as OrderLike[], token);
    } catch (e) {
      chargesError = e instanceof Error ? e.message : "charges_failed";
    }
    return NextResponse.json({ orders: list, chargeTotals, chargesError });
  } catch (e) {
    const message = e instanceof Error ? e.message : "orders_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
