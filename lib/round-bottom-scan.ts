import type { KiteOhlcBar } from "./kite-historical";
import { pivotLowIndices } from "./swing-pivots";

export type RoundBottomScanParams = {
  pivotLeft: number;
  pivotRight: number;
  /** Only pivot lows in this many bars before the last bar can be the trough. */
  troughLookbackBars: number;
  /** Minimum calendar bars from trough index to last bar. */
  minBaseBars: number;
  minDrawdownPct: number;
  /** Minimum consecutive “higher” pivot lows after the trough. */
  minHigherLowPivots: number;
  /** Bars used for volume mean/std (excluding the breakout bar). */
  volLookback: number;
};

export const DEFAULT_ROUND_BOTTOM_PARAMS: RoundBottomScanParams = {
  pivotLeft: 3,
  pivotRight: 3,
  troughLookbackBars: 120,
  minBaseBars: 18,
  minDrawdownPct: 0.06,
  minHigherLowPivots: 2,
  volLookback: 60,
};

export type RoundBottomScore = {
  troughIndex: number;
  troughTime: string;
  peakBeforeTrough: number;
  drawdownPct: number;
  baseBars: number;
  higherLowPivots: number;
  neckline: number;
  breakoutClose: number;
  breakoutPct: number;
  volumeZ: number;
  compositeScore: number;
  components: {
    drawdown: number;
    timeInBase: number;
    higherLows: number;
    breakout: number;
    volume: number;
  };
};

function meanStd(xs: number[]): { mean: number; std: number } {
  if (xs.length === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (xs.length === 1) return { mean, std: 0 };
  let v = 0;
  for (const x of xs) {
    const d = x - mean;
    v += d * d;
  }
  return { mean, std: Math.sqrt(v / (xs.length - 1)) };
}

/**
 * Heuristic “saucer” breakout: pivot trough → rising pivot lows → close clears prior range high with volume z-score.
 * Returns null if the series does not satisfy constraints.
 */
export function scoreRoundBottom(
  bars: KiteOhlcBar[],
  params: RoundBottomScanParams = DEFAULT_ROUND_BOTTOM_PARAMS,
): RoundBottomScore | null {
  const L = Math.max(1, Math.floor(params.pivotLeft));
  const R = Math.max(1, Math.floor(params.pivotRight));
  const n = bars.length;
  const minBase = Math.max(5, Math.floor(params.minBaseBars));
  const volLb = Math.max(10, Math.floor(params.volLookback));
  const minHl = Math.max(1, Math.floor(params.minHigherLowPivots));
  const minDd = params.minDrawdownPct;
  const tLb = Math.max(
    minBase + L + R + 5,
    Math.floor(params.troughLookbackBars),
  );

  if (n < Math.max(60, minBase + L + R + 10)) return null;

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);

  const pivLows = pivotLowIndices(lows, L, R);
  const lastIx = n - 1;
  const troughMaxIx = lastIx - minBase;

  const loBound = Math.max(L + R, lastIx - tLb);
  const candidates = pivLows.filter((i) => i >= loBound && i <= troughMaxIx);
  if (candidates.length === 0) return null;

  let t = candidates[0]!;
  let best = lows[t]!;
  for (const i of candidates) {
    if (lows[i]! < best) {
      best = lows[i]!;
      t = i;
    } else if (lows[i] === best && i > t) {
      t = i;
    }
  }

  let peakBefore = highs[0]!;
  for (let i = 0; i <= t; i++) {
    if (highs[i]! > peakBefore) peakBefore = highs[i]!;
  }
  const drawdownPct = (peakBefore - lows[t]!) / peakBefore;
  if (!Number.isFinite(drawdownPct) || drawdownPct < minDd) return null;

  let neckline = highs[t]!;
  for (let i = t; i <= lastIx - 1; i++) {
    if (highs[i]! > neckline) neckline = highs[i]!;
  }

  const breakoutClose = closes[lastIx]!;
  if (breakoutClose <= neckline) return null;

  const breakoutPct = (breakoutClose - neckline) / neckline;

  const afterTroughPivots = pivotLowIndices(lows, L, R).filter(
    (i) => i > t && i < lastIx,
  );
  if (afterTroughPivots.length === 0) return null;

  let prev = lows[t]!;
  let risingPivots = 0;
  for (const i of afterTroughPivots) {
    if (lows[i]! > prev) {
      risingPivots++;
      prev = lows[i]!;
    }
  }
  if (risingPivots < minHl) return null;

  const volStart = Math.max(t, lastIx - volLb);
  const volSlice: number[] = [];
  for (let i = volStart; i <= lastIx - 1; i++) volSlice.push(vols[i]!);
  const { mean: vMean, std: vStd } = meanStd(volSlice);
  const vz =
    vStd > 1e-9 ? (vols[lastIx]! - vMean) / vStd : 0;

  const baseBars = lastIx - t;

  const w = {
    dd: 0.26,
    base: 0.24,
    hl: 0.2,
    bo: 0.15,
    vol: 0.15,
  };

  const cDd = Math.min(drawdownPct / 0.32, 1);
  const cBase = Math.min(baseBars / 110, 1);
  const cHl = Math.min(risingPivots / 5, 1);
  const cBo = Math.min(breakoutPct / 0.06, 1);
  const cVol = Math.min(Math.max(vz, 0) / 2.5, 1);

  const compositeScore =
    (cDd * w.dd + cBase * w.base + cHl * w.hl + cBo * w.bo + cVol * w.vol) *
    100;

  return {
    troughIndex: t,
    troughTime: bars[t]!.time,
    peakBeforeTrough: peakBefore,
    drawdownPct,
    baseBars,
    higherLowPivots: risingPivots,
    neckline,
    breakoutClose,
    breakoutPct,
    volumeZ: vz,
    compositeScore,
    components: {
      drawdown: cDd * 100 * w.dd,
      timeInBase: cBase * 100 * w.base,
      higherLows: cHl * 100 * w.hl,
      breakout: cBo * 100 * w.bo,
      volume: cVol * 100 * w.vol,
    },
  };
}
