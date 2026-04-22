import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import {
  maCrossConfirmLatest,
  maCrossConfirmSeries,
  type MaCrossBarState,
  type MaCrossConfirmParams,
} from "./ma-cross-confirm-strategy";

export type KiteMaCrossOhlcOptions = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  /** Visible window [from, to] (IST). Extra history is fetched before `from` so SMA matches TradingView. */
  from: string;
  to: string;
  /** e.g. `MCX:SYMBOL` — retry historical with `continuous=1` if the first request returns no candles. */
  symbol?: string;
  strategy?: Partial<MaCrossConfirmParams>;
};

export type KiteMaCrossOhlcResult = {
  bars: KiteOhlcBar[];
  closes: number[];
  series: MaCrossBarState[];
  latest: {
    last: MaCrossBarState | null;
    longEntry: boolean;
    shortEntry: boolean;
  };
  /** Same fetch as `closes` but includes SMA warmup bars before `from` (live LTP merge uses this). */
  closesFull: number[];
};

/**
 * Fetch Kite historical OHLC (with warmup before `from`), run strategy, return only bars in [from, to].
 * Matches Pine `ta.sma` + streak logic when TV has prior history — we approximate by requesting earlier candles.
 */
export async function kiteMaCrossFromOhlc(
  accessToken: string,
  options: KiteMaCrossOhlcOptions,
): Promise<KiteMaCrossOhlcResult> {
  const strategy = options.strategy;
  const length = strategy?.length ?? 9;
  const confirmBars = strategy?.confirmBars ?? 1;

  const userFrom = options.from;
  const userTo = options.to;
  const warmupBars =
    Math.max(0, length - 1) + confirmBars + 20;
  const { barsFull } = await fetchKiteOhlcVisibleWindow(accessToken, {
    instrumentToken: options.instrumentToken,
    interval: options.interval,
    userFrom,
    userTo,
    warmupBars,
    symbol: options.symbol,
  });
  const closesFull = barsFull.map((b) => b.close);
  const seriesFull = maCrossConfirmSeries(closesFull, strategy);

  const times = barsFull.map((b) => b.time);
  let idx = barIndicesInIstRange(times, userFrom, userTo);
  if (!idx.length && barsFull.length > 0) {
    idx = barsFull.map((_, i) => i);
  }
  const bars = idx.map((i) => barsFull[i]!);
  const closes = idx.map((i) => closesFull[i]!);
  const series = idx.map((j, k) => {
    const row = seriesFull[j]!;
    return {
      ...row,
      index: k,
    };
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

export { maCrossConfirmSeries, maCrossConfirmLatest };
export type { KiteOhlcBar, MaCrossConfirmParams, MaCrossBarState };
