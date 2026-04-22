import { NextRequest, NextResponse } from "next/server";
import {
  fetchKiteInstrumentTokenForKey,
  normalizeKiteInstrumentKey,
  type KiteHistoricalInterval,
} from "@/lib/kite-historical";
import { kiteHtfLevelsFromOhlc } from "@/lib/kite-htf-ohlc";
import { getKiteAccessToken } from "@/lib/kite-session";
import {
  getKiteAccessTokenForWebhook,
  persistKiteAccessTokenForWebhook,
} from "@/lib/kite-webhook-access-token";
import { clampIntradayHistoricalWindow } from "@/lib/kite-ist-time";

const INTERVALS = new Set<string>([
  "minute",
  "day",
  "3minute",
  "5minute",
  "10minute",
  "15minute",
  "30minute",
  "60minute",
]);

/**
 * GET /api/kite/htf-levels — higher-timeframe OHLC expanded to O/H/L/C levels.
 *
 * Query: `symbol`, `from`, `to`, `htf_interval` (default `day`).
 */
export async function GET(req: NextRequest) {
  const accessToken =
    (await getKiteAccessToken()) ?? (await getKiteAccessTokenForWebhook());
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const symbolRaw = sp.get("symbol")?.trim();
  if (!symbolRaw) {
    return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  }
  let from = sp.get("from")?.trim();
  let to = sp.get("to")?.trim();
  if (!from || !to) {
    return NextResponse.json({ error: "from_to_required" }, { status: 400 });
  }

  const htfRaw = sp.get("htf_interval")?.trim() || "day";
  if (!INTERVALS.has(htfRaw)) {
    return NextResponse.json({ error: "invalid_htf_interval" }, { status: 400 });
  }
  const htfInterval = htfRaw as KiteHistoricalInterval;

  const range = clampIntradayHistoricalWindow(htfRaw, from, to);
  from = range.from;
  to = range.to;

  const symbol = normalizeKiteInstrumentKey(symbolRaw);

  try {
    const instrumentToken = await fetchKiteInstrumentTokenForKey(
      accessToken,
      symbolRaw,
    );
    void persistKiteAccessTokenForWebhook(accessToken);
    const result = await kiteHtfLevelsFromOhlc(accessToken, {
      instrumentToken,
      htfInterval,
      from,
      to,
      symbol: symbolRaw,
    });
    if (!result.htfBars.length) {
      return NextResponse.json(
        {
          error:
            result.barsFull.length === 0
              ? "kite_returned_no_candles"
              : "no_bars_in_requested_range",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      symbol,
      instrument_token: instrumentToken,
      htf_interval: htfInterval,
      from,
      to,
      range_clamped: range.clamped,
      bars: result.htfBars,
      zones: result.zones,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "htf_levels_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
