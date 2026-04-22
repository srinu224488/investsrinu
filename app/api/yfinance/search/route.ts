import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export type YahooSearchQuoteRow = {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ quotes: [] as YahooSearchQuoteRow[] });
  }

  try {
    const result = await yahooFinance.search(q, {
      quotesCount: 14,
      newsCount: 0,
    });

    const raw = result.quotes ?? [];
    const quotes: YahooSearchQuoteRow[] = [];

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const symbol = typeof row.symbol === "string" ? row.symbol : "";
      if (!symbol) continue;
      quotes.push({
        symbol,
        shortname: typeof row.shortname === "string" ? row.shortname : undefined,
        longname: typeof row.longname === "string" ? row.longname : undefined,
        exchange: typeof row.exchange === "string" ? row.exchange : undefined,
        quoteType: typeof row.quoteType === "string" ? row.quoteType : undefined,
      });
    }

    return NextResponse.json({ quotes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "search_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
