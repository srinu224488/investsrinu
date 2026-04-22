import { NextRequest, NextResponse } from "next/server";
import { handleZerodhaKitePostback } from "@/lib/kite-postback-listener";

/**
 * Zerodha Kite postback URL (HTTPS): realtime order completion / status POSTs
 * for orders placed with your app's api_key.
 * Register: Kite developer console → App → Postback URL → this full HTTPS URL.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "zerodha_kite_postback",
    description:
      "POST order update JSON here. Set this URL as Postback URL in Kite Connect (HTTPS only).",
    docs: "https://kite.trade/docs/connect/v3/postbacks/",
  });
}

/** Kite validates the postback URL with HEAD when you save it in the developer console. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const result = await handleZerodhaKitePostback(raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
