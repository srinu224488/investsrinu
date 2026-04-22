/**
 * Port of TradingView Pine "MovingAvg Cross" confirmation logic:
 * SMA(close, length); long after `confirmBars` consecutive closes above MA;
 * short after `confirmBars` consecutive closes below MA.
 * Uses close only (same as Pine `price = close`).
 *
 * At bar `i`, `sma` is the mean of `close[i-length+1]…close[i]` — the **last `length` closes**
 * including the current bar (Pine `ta.sma(close, length)`).
 *
 * For parity with TradingView, `closes` should include bars *before* your window so the SMA
 * matches — see `extendIstFromForMaWarmup` + `kiteMaCrossFromOhlc`.
 */

import {
  fetchKiteHistoricalOhlc,
  fetchKiteInstrumentTokenForKey,
  type FetchKiteHistoricalOptions,
  type KiteHistoricalInterval,
  type KiteOhlcBar,
} from "./kite-historical";

export type MaCrossConfirmParams = {
  length: number;
  confirmBars: number;
};

export type MaCrossBarState = {
  index: number;
  close: number;
  sma: number | null;
  aboveCount: number;
  belowCount: number;
  longEntry: boolean;
  shortEntry: boolean;
};

function rollingSmaAt(closes: number[], index: number, length: number): number | null {
  if (length < 1 || index < length - 1) return null;
  let sum = 0;
  for (let j = index - length + 1; j <= index; j++) sum += closes[j]!;
  return sum / length;
}

/**
 * Walk closes oldest → newest (same order as Kite `candles`).
 */
export function maCrossConfirmSeries(
  closes: number[],
  params: Partial<MaCrossConfirmParams> = {},
): MaCrossBarState[] {
  const length = params.length ?? 9;
  const confirmBars = params.confirmBars ?? 1;
  const n = closes.length;
  const out: MaCrossBarState[] = [];
  let aboveCount = 0;
  let belowCount = 0;

  for (let i = 0; i < n; i++) {
    const close = closes[i]!;
    const sma = rollingSmaAt(closes, i, length);
    let longEntry = false;
    let shortEntry = false;

    if (sma !== null) {
      if (close > sma) {
        aboveCount = aboveCount + 1;
      } else {
        aboveCount = 0;
      }
      if (close < sma) {
        belowCount = belowCount + 1;
      } else {
        belowCount = 0;
      }
      if (aboveCount === confirmBars) longEntry = true;
      if (belowCount === confirmBars) shortEntry = true;
    } else {
      aboveCount = 0;
      belowCount = 0;
    }

    out.push({
      index: i,
      close,
      sma,
      aboveCount,
      belowCount,
      longEntry,
      shortEntry,
    });
  }
  return out;
}

export type MaCrossLatest = {
  last: MaCrossBarState | null;
  longEntry: boolean;
  shortEntry: boolean;
};

export function maCrossConfirmLatest(
  closes: number[],
  params?: Partial<MaCrossConfirmParams>,
): MaCrossLatest {
  const series = maCrossConfirmSeries(closes, params);
  const last = series.length ? series[series.length - 1]! : null;
  return {
    last,
    longEntry: Boolean(last?.longEntry),
    shortEntry: Boolean(last?.shortEntry),
  };
}

/** Minimal bar shape for the Web Streams transform (close-only strategy). */
export type MaCrossOhlcChunk = { close: number };

/**
 * Transform OHLC chunks (oldest → newest) into per-bar strategy state; matches `maCrossConfirmSeries` on closes.
 */
export function createMaCrossOhlcTransformStream(
  params: Partial<MaCrossConfirmParams> = {},
): TransformStream<MaCrossOhlcChunk, MaCrossBarState> {
  const length = params.length ?? 9;
  const confirmBars = params.confirmBars ?? 1;
  let index = 0;
  const window: number[] = [];
  let sum = 0;
  let aboveCount = 0;
  let belowCount = 0;

  return new TransformStream({
    transform(bar, controller) {
      const close = bar.close;
      window.push(close);
      sum += close;
      if (window.length > length) {
        sum -= window.shift()!;
      }
      const sma = window.length === length ? sum / length : null;

      let longEntry = false;
      let shortEntry = false;
      if (sma !== null) {
        if (close > sma) {
          aboveCount = aboveCount + 1;
        } else {
          aboveCount = 0;
        }
        if (close < sma) {
          belowCount = belowCount + 1;
        } else {
          belowCount = 0;
        }
        if (aboveCount === confirmBars) longEntry = true;
        if (belowCount === confirmBars) shortEntry = true;
      } else {
        aboveCount = 0;
        belowCount = 0;
      }

      controller.enqueue({
        index,
        close,
        sma,
        aboveCount,
        belowCount,
        longEntry,
        shortEntry,
      });
      index += 1;
    },
  });
}

export type KiteOhlcStreamForSymbolOptions = {
  symbol: string;
  interval: KiteHistoricalInterval;
  from: string;
  to: string;
  historical?: FetchKiteHistoricalOptions;
};

/**
 * Build a ReadableStream of Kite historical OHLC bars for a user symbol (`NSE:…` or bare symbol).
 * Underlying HTTP returns one JSON payload; bars are then enqueued in Kite order (oldest first).
 */
export async function kiteOhlcReadableStreamForSymbol(
  accessToken: string,
  options: KiteOhlcStreamForSymbolOptions,
): Promise<ReadableStream<KiteOhlcBar>> {
  const token = await fetchKiteInstrumentTokenForKey(accessToken, options.symbol);
  const bars = await fetchKiteHistoricalOhlc(
    accessToken,
    token,
    options.interval,
    options.from,
    options.to,
    options.historical,
  );
  return new ReadableStream<KiteOhlcBar>({
    start(controller) {
      for (const b of bars) controller.enqueue(b);
      controller.close();
    },
  });
}

export type MaCrossSymbolWebStreamOptions = KiteOhlcStreamForSymbolOptions & {
  strategy?: Partial<MaCrossConfirmParams>;
};

/**
 * Pull historical OHLC by symbol, then pipe through the MA-cross transform (Web Streams).
 */
export async function maCrossConfirmReadableStreamForSymbol(
  accessToken: string,
  options: MaCrossSymbolWebStreamOptions,
): Promise<ReadableStream<MaCrossBarState>> {
  const ohlc = await kiteOhlcReadableStreamForSymbol(accessToken, options);
  return ohlc.pipeThrough(createMaCrossOhlcTransformStream(options.strategy));
}

/** Drain a MaCrossBarState stream into an array (same order as `maCrossConfirmSeries`). */
export async function collectMaCrossBarStream(
  stream: ReadableStream<MaCrossBarState>,
): Promise<MaCrossBarState[]> {
  const reader = stream.getReader();
  const out: MaCrossBarState[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}
