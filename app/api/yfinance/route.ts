import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuoteAndSummary } from "@/lib/yfinance-quote";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  }
  try {
    const bundle = await fetchYahooQuoteAndSummary(symbol);
    return NextResponse.json(bundle);
  } catch (e) {
    const message = e instanceof Error ? e.message : "yfinance_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
