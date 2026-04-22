import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import {
  rsiWithDivergenceSeries,
  type RsiBarState,
  type RsiParams,
} from "./rsi-strategy";

export type KiteRsiOhlcOptions = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  from: string;
  to: string;
  symbol?: string;
  strategy?: Partial<RsiParams>;
};

export type KiteRsiOhlcResult = {
  bars: KiteOhlcBar[];
  closes: number[];
  series: RsiBarState[];
  latest: {
    last: RsiBarState | null;
    lastRsi: number | null;
  };
  closesFull: number[];
  highsFull: number[];
  lowsFull: number[];
};

function warmupBarsForRsi(period: number, pivotLeft: number, pivotRight: number): number {
  return Math.min(
    500,
    Math.max(period * 3, 60) + pivotLeft + pivotRight + 30,
  );
}

export async function kiteRsiFromOhlc(
  accessToken: string,
  options: KiteRsiOhlcOptions,
): Promise<KiteRsiOhlcResult> {
  const strategy = options.strategy;
  const period = strategy?.period ?? 14;
  const pivotLeft = strategy?.pivotLeft ?? 2;
  const pivotRight = strategy?.pivotRight ?? 2;
  const warmupBars = warmupBarsForRsi(period, pivotLeft, pivotRight);

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

  const closesFull = barsFull.map((b) => b.close);
  const highsFull = barsFull.map((b) => b.high);
  const lowsFull = barsFull.map((b) => b.low);

  const seriesFull = rsiWithDivergenceSeries(
    closesFull,
    highsFull,
    lowsFull,
    { period, pivotLeft, pivotRight },
  );

  const times = barsFull.map((b) => b.time);
  let idx = barIndicesInIstRange(times, userFrom, userTo);
  if (!idx.length && barsFull.length > 0) {
    idx = barsFull.map((_, i) => i);
  }

  const bars = idx.map((i) => barsFull[i]!);
  const closes = idx.map((i) => closesFull[i]!);
  const series = idx.map((j, k) => {
    const row = seriesFull[j]!;
    return { ...row, index: k };
  });

  const lastFullIdx = idx.length ? idx[idx.length - 1]! : -1;
  const lastState = lastFullIdx >= 0 ? seriesFull[lastFullIdx]! : null;

  return {
    bars,
    closes,
    series,
    latest: {
      last: lastState,
      lastRsi: lastState?.rsi ?? null,
    },
    closesFull,
    highsFull,
    lowsFull,
  };
}
