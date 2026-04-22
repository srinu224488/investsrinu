import { pivotHighIndices, pivotLowIndices } from "./swing-pivots";

export type RsiParams = {
  period: number;
  pivotLeft: number;
  pivotRight: number;
};

export type RsiBarState = {
  index: number;
  close: number;
  rsi: number | null;
  pivotHigh: boolean;
  pivotLow: boolean;
  /** Regular bearish divergence at this pivot high vs previous pivot high */
  divergenceBearish: boolean;
  /** Regular bullish divergence at this pivot low vs previous pivot low */
  divergenceBullish: boolean;
};

/** Wilder RSI on closes; null until enough bars for first RSI. */
export function rsiWilderSeries(closes: number[], period: number): (number | null)[] {
  const p = Math.max(1, Math.floor(period));
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n <= p || p < 1) return out;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= p; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= p;
  avgLoss /= p;

  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out[p] = 100 - 100 / (1 + rs0);

  for (let i = p + 1; i < n; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (p - 1) + gain) / p;
    avgLoss = (avgLoss * (p - 1) + loss) / p;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }

  return out;
}

/**
 * RSI series plus heuristic regular divergence flags at pivot completions (OHLC-based, not tick-perfect).
 */
export function rsiWithDivergenceSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  params: Partial<RsiParams> = {},
): RsiBarState[] {
  const period = params.period ?? 14;
  const pivotLeft = params.pivotLeft ?? 2;
  const pivotRight = params.pivotRight ?? 2;

  const rsiArr = rsiWilderSeries(closes, period);
  const n = closes.length;
  const phIdx = pivotHighIndices(highs, pivotLeft, pivotRight);
  const plIdx = pivotLowIndices(lows, pivotLeft, pivotRight);

  const divBearishAt = new Set<number>();
  const divBullishAt = new Set<number>();

  for (let k = 1; k < phIdx.length; k++) {
    const i1 = phIdx[k - 1]!;
    const i2 = phIdx[k]!;
    const r1 = rsiArr[i1];
    const r2 = rsiArr[i2];
    if (
      r1 !== null &&
      r2 !== null &&
      highs[i2]! > highs[i1]! &&
      r2 < r1
    ) {
      divBearishAt.add(i2);
    }
  }

  for (let k = 1; k < plIdx.length; k++) {
    const i1 = plIdx[k - 1]!;
    const i2 = plIdx[k]!;
    const r1 = rsiArr[i1];
    const r2 = rsiArr[i2];
    if (
      r1 !== null &&
      r2 !== null &&
      lows[i2]! < lows[i1]! &&
      r2 > r1
    ) {
      divBullishAt.add(i2);
    }
  }

  const phSet = new Set(phIdx);
  const plSet = new Set(plIdx);

  const out: RsiBarState[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      index: i,
      close: closes[i]!,
      rsi: rsiArr[i] ?? null,
      pivotHigh: phSet.has(i),
      pivotLow: plSet.has(i),
      divergenceBearish: divBearishAt.has(i),
      divergenceBullish: divBullishAt.has(i),
    });
  }

  return out;
}
