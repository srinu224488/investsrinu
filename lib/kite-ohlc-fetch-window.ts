import {
  fetchKiteHistoricalOhlc,
  type KiteHistoricalInterval,
  type KiteOhlcBar,
} from "./kite-historical";
import {
  clampIntradayHistoricalWindow,
  extendIstFromForWarmupBars,
} from "./kite-ist-time";

export type FetchKiteOhlcVisibleWindowOpts = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  userFrom: string;
  userTo: string;
  /** Approximate bars of history to request before `userFrom` for indicator warmup. */
  warmupBars: number;
  /** e.g. `MCX:SYMBOL` — retry historical with `continuous=1` if the first request returns no candles. */
  symbol?: string;
};

/**
 * Fetch Kite OHLC from an extended `from` (warmup) through `userTo`, with intraday clamping.
 */
export async function fetchKiteOhlcVisibleWindow(
  accessToken: string,
  opts: FetchKiteOhlcVisibleWindowOpts,
): Promise<{
  barsFull: KiteOhlcBar[];
  fetchRange: { from: string; to: string; clamped: boolean };
}> {
  const extendedFrom = extendIstFromForWarmupBars(
    opts.userFrom,
    opts.interval,
    opts.warmupBars,
  );
  const range = clampIntradayHistoricalWindow(
    opts.interval,
    extendedFrom,
    opts.userTo,
  );

  let barsFull = await fetchKiteHistoricalOhlc(
    accessToken,
    opts.instrumentToken,
    opts.interval,
    range.from,
    opts.userTo,
  );
  if (
    !barsFull.length &&
    opts.symbol?.trim().toUpperCase().startsWith("MCX:")
  ) {
    barsFull = await fetchKiteHistoricalOhlc(
      accessToken,
      opts.instrumentToken,
      opts.interval,
      range.from,
      opts.userTo,
      { continuous: 1 },
    );
  }

  return {
    barsFull,
    fetchRange: {
      from: range.from,
      to: opts.userTo,
      clamped: range.clamped,
    },
  };
}
