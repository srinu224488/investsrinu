import { type KiteHistoricalInterval, type KiteOhlcBar } from "./kite-historical";
import { fetchKiteOhlcVisibleWindow } from "./kite-ohlc-fetch-window";
import { barIndicesInIstRange } from "./kite-ist-time";
import {
  fibRetracementLevels,
  type FibLevelRow,
} from "./fib-levels";
import { lastPivotImpulse } from "./swing-pivots";

export type KiteFibOhlcOptions = {
  instrumentToken: number | string;
  interval: KiteHistoricalInterval;
  from: string;
  to: string;
  symbol?: string;
  pivotLeft: number;
  pivotRight: number;
};

export type KiteFibOhlcResult = {
  bars: KiteOhlcBar[];
  impulse: {
    impulseLow: number;
    impulseHigh: number;
    lowIdx: number;
    highIdx: number;
    direction: "up" | "down";
  } | null;
  fibLevels: FibLevelRow[];
  closesFull: number[];
};

export async function kiteFibFromOhlc(
  accessToken: string,
  options: KiteFibOhlcOptions,
): Promise<KiteFibOhlcResult> {
  const L = options.pivotLeft;
  const R = options.pivotRight;
  const warmupBars = Math.min(500, L + R + 80);

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

  const highsFull = barsFull.map((b) => b.high);
  const lowsFull = barsFull.map((b) => b.low);
  const closesFull = barsFull.map((b) => b.close);

  const impulse = lastPivotImpulse(highsFull, lowsFull, L, R);

  let fibLevels: FibLevelRow[] = [];
  if (impulse) {
    fibLevels = fibRetracementLevels(
      impulse.impulseLow,
      impulse.impulseHigh,
      impulse.direction,
    );
  }

  const times = barsFull.map((b) => b.time);
  let idx = barIndicesInIstRange(times, userFrom, userTo);
  if (!idx.length && barsFull.length > 0) {
    idx = barsFull.map((_, i) => i);
  }
  const bars = idx.map((i) => barsFull[i]!);

  return {
    bars,
    impulse,
    fibLevels,
    closesFull,
  };
}
