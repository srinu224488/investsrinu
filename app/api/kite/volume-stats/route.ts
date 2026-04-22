import { NextRequest, NextResponse } from "next/server";
import {
  fetchKiteInstrumentTokenForKey,
  normalizeKiteInstrumentKey,
  type KiteHistoricalInterval,
} from "@/lib/kite-historical";
import { kiteVolumeStatsFromOhlc } from "@/lib/kite-volume-ohlc";
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
 * GET /api/kite/volume-stats — volume SMA and relative volume on Kite OHLC.
 *
 * Query: `symbol`, `from`, `to`, `interval`, `sma_length` (default 20).
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

  const intervalRaw = sp.get("interval")?.trim() || "day";
  if (!INTERVALS.has(intervalRaw)) {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }
  const interval = intervalRaw as KiteHistoricalInterval;

  const range = clampIntradayHistoricalWindow(intervalRaw, from, to);
  from = range.from;
  to = range.to;

  const smaLength = Math.min(
    200,
    Math.max(2, Math.floor(Number(sp.get("sma_length") ?? 20) || 20)),
  );

  const symbol = normalizeKiteInstrumentKey(symbolRaw);

  try {
    const instrumentToken = await fetchKiteInstrumentTokenForKey(
      accessToken,
      symbolRaw,
    );
    void persistKiteAccessTokenForWebhook(accessToken);
    const result = await kiteVolumeStatsFromOhlc(accessToken, {
      instrumentToken,
      interval,
      from,
      to,
      symbol: symbolRaw,
      smaLength,
    });
    if (!result.bars.length) {
      return NextResponse.json(
        {
          error:
            result.volumesFull.length === 0
              ? "kite_returned_no_candles"
              : "no_bars_in_requested_range",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      symbol,
      instrument_token: instrumentToken,
      interval,
      from,
      to,
      range_clamped: range.clamped,
      strategy: { smaLength },
      bars: result.bars,
      series: result.series,
      latest: result.latest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "volume_stats_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
