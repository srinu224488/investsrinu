import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import { barsToHtfZoneRows, type HtfZoneRow } from "./htf-zones";

export type KiteHtfLevelsOptions = {
  instrumentToken: number | string;
  htfInterval: KiteHistoricalInterval;
  from: string;
  to: string;
  symbol?: string;
};

export type KiteHtfLevelsResult = {
  htfBars: KiteOhlcBar[];
  zones: HtfZoneRow[];
  barsFull: KiteOhlcBar[];
};

/**
 * Fetch higher-timeframe OHLC in [from, to] and expand each bar to O/H/L/C zone levels.
 * `warmupBars` is minimal; HTF context is the bars themselves.
 */
export async function kiteHtfLevelsFromOhlc(
  accessToken: string,
  options: KiteHtfLevelsOptions,
): Promise<KiteHtfLevelsResult> {
  const userFrom = options.from;
  const userTo = options.to;
  const warmupBars = 2;

  const { barsFull } = await fetchKiteOhlcVisibleWindow(accessToken, {
    instrumentToken: options.instrumentToken,
    interval: options.htfInterval,
    userFrom,
    userTo,
    warmupBars,
    symbol: options.symbol,
  });

  const times = barsFull.map((b) => b.time);
  let idx = barIndicesInIstRange(times, userFrom, userTo);
  if (!idx.length && barsFull.length > 0) {
    idx = barsFull.map((_, i) => i);
  }
  const htfBars = idx.map((i) => barsFull[i]!);
  const zones = barsToHtfZoneRows(htfBars);

  return {
    htfBars,
    zones,
    barsFull,
  };
}
