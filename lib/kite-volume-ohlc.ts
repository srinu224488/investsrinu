import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import { volumeStatsSeries, type VolumeBarState } from "./volume-stats";

export type KiteVolumeOhlcOptions = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  from: string;
  to: string;
  symbol?: string;
  smaLength: number;
};

export type KiteVolumeOhlcResult = {
  bars: KiteOhlcBar[];
  series: VolumeBarState[];
  latest: {
    last: VolumeBarState | null;
  };
  volumesFull: number[];
};

export async function kiteVolumeStatsFromOhlc(
  accessToken: string,
  options: KiteVolumeOhlcOptions,
): Promise<KiteVolumeOhlcResult> {
  const smaLength = options.smaLength;
  const warmupBars = Math.min(500, smaLength + 40);

  const userFrom = options.from;
  const userTo = options.to;

  const { barsFull } = await fetchKiteOhlcVisibleWindow(accessToken, {
    instrumentToken: options.instrumentToken,
    interval: options.interval,
    userFrom,
    userTo,
    warmupBars,
    symbol: options.symbol,
  });

  const volumesFull = barsFull.map((b) => b.volume);
  const seriesFull = volumeStatsSeries(volumesFull, smaLength);

  const times = barsFull.map((b) => b.time);
  let idx = barIndicesInIstRange(times, userFrom, userTo);
  if (!idx.length && barsFull.length > 0) {
    idx = barsFull.map((_, i) => i);
  }

  const bars = idx.map((i) => barsFull[i]!);
  const series = idx.map((j, k) => {
    const row = seriesFull[j]!;
    return { ...row, index: k };
  });

  const lastFullIdx = idx.length ? idx[idx.length - 1]! : -1;
  const lastState = lastFullIdx >= 0 ? seriesFull[lastFullIdx]! : null;

  return {
    bars,
    series,
    latest: { last: lastState },
    volumesFull,
  };
}
