import { NextResponse } from "next/server";
import { kiteGet } from "@/lib/kite-client";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import { getKiteAccessToken } from "@/lib/kite-session";

type KitePositionsEnvelope = {
  net?: unknown[];
  day?: unknown[];
};

export async function GET() {
  const token = await getKiteAccessToken();
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  try {
    const [holdings, positions] = await Promise.all([
      kiteGet<unknown[]>("/portfolio/holdings", token),
      kiteGet<KitePositionsEnvelope>("/portfolio/positions", token),
    ]);
    void persistKiteAccessTokenForWebhook(token);
    return NextResponse.json({
      holdings: holdings ?? [],
      positions: {
        net: positions?.net ?? [],
        day: positions?.day ?? [],
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "portfolio_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
