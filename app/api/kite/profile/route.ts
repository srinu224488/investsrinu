import { NextResponse } from "next/server";
import { kiteGet } from "@/lib/kite-client";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import { getKiteAccessToken } from "@/lib/kite-session";

export async function GET() {
  const token = await getKiteAccessToken();
  if (!token) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }
  try {
    const profile = await kiteGet("/user/profile", token);
    void persistKiteAccessTokenForWebhook(token);
    return NextResponse.json({ connected: true, profile });
  } catch (e) {
    const message = e instanceof Error ? e.message : "profile_failed";
    return NextResponse.json({ connected: false, error: message }, { status: 401 });
  }
}
