import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import {
  emaConfirmSeries,
  type EmaBarState,
  type EmaConfirmParams,
} from "./ema-strategy";

export type KiteEmaOhlcOptions = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  from: string;
  to: string;
  symbol?: string;
  strategy?: Partial<EmaConfirmParams>;
};

export type KiteEmaOhlcResult = {
  bars: KiteOhlcBar[];
  closes: number[];
  series: EmaBarState[];
  latest: {
    last: EmaBarState | null;
    longEntry: boolean;
    shortEntry: boolean;
  };
  closesFull: number[];
};

function warmupBarsForEma(length: number, confirmBars: number): number {
  return Math.min(500, Math.max(length * 5, 50) + confirmBars + 20);
}

export async function kiteEmaFromOhlc(
  accessToken: string,
  options: KiteEmaOhlcOptions,
): Promise<KiteEmaOhlcResult> {
  const strategy = options.strategy;
  const length = strategy?.length ?? 21;
  const confirmBars = strategy?.confirmBars ?? 1;
  const warmupBars = warmupBarsForEma(length, confirmBars);

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
  const seriesFull = emaConfirmSeries(closesFull, strategy);

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
  const latest = {
    last: lastState,
    longEntry: Boolean(lastState?.longEntry),
    shortEntry: Boolean(lastState?.shortEntry),
  };

  return { bars, closes, series, latest, closesFull };
}
