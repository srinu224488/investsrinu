import { NextRequest, NextResponse } from "next/server";

const FALLBACK = "https://kiteob.vercel.app/api/webhooks/kite";

function urlFromRequest(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (!host) return FALLBACK;
  const rawProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const proto = rawProto.toLowerCase() === "http" ? "http" : "https";
  return `${proto}://${host}/api/webhooks/kite`;
}

export async function GET(req: NextRequest) {
  const raw = process.env.KITE_POSTBACK_URL?.trim() ?? "";
  const fromEnv = raw.startsWith("https://");
  const url = fromEnv ? raw : urlFromRequest(req);
  return NextResponse.json({ url, fromEnv });
}
