import { NextRequest, NextResponse } from "next/server";
import {
  fetchKiteInstrumentTokenForKey,
  normalizeKiteInstrumentKey,
  type KiteHistoricalInterval,
} from "@/lib/kite-historical";
import { kiteMaCrossFromOhlc } from "@/lib/kite-ma-cross-ohlc";
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
 * GET /api/kite/ma-cross — historical OHLC + MA cross confirm series (Kite session or server token).
 *
 * Query: `symbol` (required), `from`, `to` (yyyy-mm-dd hh:mm:ss IST), `interval` (default `day`),
 * `length` (SMA length, default 9), `confirm_bars` (default 1).
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

  const lengthRaw = sp.get("length");
  const length = Math.min(
    500,
    Math.max(1, Math.floor(Number(lengthRaw ?? 9) || 9)),
  );
  const confirmRaw = sp.get("confirm_bars");
  const confirmBars = Math.min(
    100,
    Math.max(1, Math.floor(Number(confirmRaw ?? 1) || 1)),
  );

  const symbol = normalizeKiteInstrumentKey(symbolRaw);

  try {
    const instrumentToken = await fetchKiteInstrumentTokenForKey(
      accessToken,
      symbolRaw,
    );
    void persistKiteAccessTokenForWebhook(accessToken);
    const result = await kiteMaCrossFromOhlc(accessToken, {
      instrumentToken,
      interval,
      from,
      to,
      symbol: symbolRaw,
      strategy: { length, confirmBars },
    });
    if (!result.bars.length) {
      return NextResponse.json(
        {
          error:
            result.closesFull.length === 0
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
      strategy: { length, confirmBars },
      bars: result.bars,
      series: result.series,
      latest: result.latest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "ma_cross_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
