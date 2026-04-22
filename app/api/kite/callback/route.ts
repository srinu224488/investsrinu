import { NextRequest, NextResponse } from "next/server";
import { kiteSessionChecksum } from "@/lib/kite-checksum";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import { KITE_ACCESS_COOKIE_NAME } from "@/lib/kite-session";

export async function GET(req: NextRequest) {
  const requestToken = req.nextUrl.searchParams.get("request_token");
  const status = req.nextUrl.searchParams.get("status");
  if (status === "failure" || !requestToken) {
    return NextResponse.redirect(new URL("/?kite=denied", req.url));
  }
  const key = process.env.KITE_API_KEY?.trim();
  const secret = process.env.KITE_API_SECRET?.trim();
  if (!key || !secret) {
    return NextResponse.redirect(new URL("/?kite=config", req.url));
  }
  const checksum = kiteSessionChecksum(key, requestToken, secret);
  const res = await fetch("https://api.kite.trade/session/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Kite-Version": "3",
    },
    body: new URLSearchParams({
      api_key: key,
      request_token: requestToken,
      checksum,
    }),
  });
  const json = (await res.json()) as {
    status?: string;
    message?: string;
    data?: { access_token?: string };
  };
  if (!res.ok || json.status === "error" || !json.data?.access_token) {
    const msg = json.message || "token_exchange_failed";
    return NextResponse.redirect(new URL(`/?kite=${encodeURIComponent(msg)}`, req.url));
  }
  const at = json.data.access_token;
  await persistKiteAccessTokenForWebhook(at);

  const out = NextResponse.redirect(new URL("/?kite=ok", req.url));
  out.cookies.set(KITE_ACCESS_COOKIE_NAME, at, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return out;
}
