/**
 * EMA(close, length) with optional consecutive-bar confirmation (same idea as MA-cross).
 */

export type EmaConfirmParams = {
  length: number;
  confirmBars: number;
};

export type EmaBarState = {
  index: number;
  close: number;
  ema: number | null;
  aboveCount: number;
  belowCount: number;
  longEntry: boolean;
  shortEntry: boolean;
};

/** Rolling EMA(closes); null until first anchored SMA at index `length - 1`. */
export function emaSeries(closes: number[], length: number): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (length < 1 || n === 0) return out;

  const alpha = 2 / (length + 1);
  let ema = 0;

  for (let i = 0; i < n; i++) {
    if (i < length - 1) {
      out[i] = null;
    } else if (i === length - 1) {
      let sum = 0;
      for (let j = 0; j < length; j++) sum += closes[j]!;
      ema = sum / length;
      out[i] = ema;
    } else {
      ema = alpha * closes[i]! + (1 - alpha) * ema;
      out[i] = ema;
    }
  }

  return out;
}

/** Walk closes oldest → newest */
export function emaConfirmSeries(
  closes: number[],
  params: Partial<EmaConfirmParams> = {},
): EmaBarState[] {
  const length = params.length ?? 21;
  const confirmBars = params.confirmBars ?? 1;
  const n = closes.length;
  const emaArr = emaSeries(closes, length);
  const out: EmaBarState[] = [];
  let aboveCount = 0;
  let belowCount = 0;

  for (let i = 0; i < n; i++) {
    const close = closes[i]!;
    const ema = emaArr[i];
    let longEntry = false;
    let shortEntry = false;

    if (ema !== null) {
      if (close > ema) {
        aboveCount = aboveCount + 1;
      } else {
        aboveCount = 0;
      }
      if (close < ema) {
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
      ema,
      aboveCount,
      belowCount,
      longEntry,
      shortEntry,
    });
  }

  return out;
}

export function emaConfirmLatest(
  closes: number[],
  params: Partial<EmaConfirmParams> = {},
): Pick<EmaBarState, "longEntry" | "shortEntry"> & { last: EmaBarState | null } {
  const series = emaConfirmSeries(closes, params);
  const last = series.length ? series[series.length - 1]! : null;
  return {
    last,
    longEntry: Boolean(last?.longEntry),
    shortEntry: Boolean(last?.shortEntry),
  };
}
