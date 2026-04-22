import { NextRequest, NextResponse } from "next/server";
import {
  fetchKiteInstrumentTokenForKey,
  normalizeKiteInstrumentKey,
  type KiteHistoricalInterval,
} from "@/lib/kite-historical";
import { kiteRsiFromOhlc } from "@/lib/kite-rsi-ohlc";
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
 * GET /api/kite/rsi — Wilder RSI + heuristic pivot divergence flags on Kite OHLC.
 *
 * Query: `symbol`, `from`, `to`, `interval`, `period` (default 14),
 * `pivot_left`, `pivot_right` (default 2).
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

  const period = Math.min(
    100,
    Math.max(2, Math.floor(Number(sp.get("period") ?? 14) || 14)),
  );
  const pivotLeft = Math.min(
    10,
    Math.max(1, Math.floor(Number(sp.get("pivot_left") ?? 2) || 2)),
  );
  const pivotRight = Math.min(
    10,
    Math.max(1, Math.floor(Number(sp.get("pivot_right") ?? 2) || 2)),
  );

  const symbol = normalizeKiteInstrumentKey(symbolRaw);

  try {
    const instrumentToken = await fetchKiteInstrumentTokenForKey(
      accessToken,
      symbolRaw,
    );
    void persistKiteAccessTokenForWebhook(accessToken);
    const result = await kiteRsiFromOhlc(accessToken, {
      instrumentToken,
      interval,
      from,
      to,
      symbol: symbolRaw,
      strategy: { period, pivotLeft, pivotRight },
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
      strategy: { period, pivotLeft, pivotRight },
      bars: result.bars,
      series: result.series,
      latest: result.latest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "rsi_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
