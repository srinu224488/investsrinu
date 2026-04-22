/**
 * Fractal-style pivot highs/lows: bar at `i` is a pivot high if its high is strictly greater
 * than highs of the previous `left` and next `right` bars (same-length windows).
 */

export function pivotHighIndices(
  highs: number[],
  left: number,
  right: number,
): number[] {
  const n = highs.length;
  const out: number[] = [];
  const L = Math.max(1, Math.floor(left));
  const R = Math.max(1, Math.floor(right));

  for (let i = L; i <= n - 1 - R; i++) {
    const h = highs[i]!;
    let ok = true;
    for (let k = i - L; k < i && ok; k++) {
      if (highs[k]! >= h) ok = false;
    }
    for (let k = i + 1; k <= i + R && ok; k++) {
      if (highs[k]! >= h) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

export function pivotLowIndices(
  lows: number[],
  left: number,
  right: number,
): number[] {
  const n = lows.length;
  const out: number[] = [];
  const L = Math.max(1, Math.floor(left));
  const R = Math.max(1, Math.floor(right));

  for (let i = L; i <= n - 1 - R; i++) {
    const lo = lows[i]!;
    let ok = true;
    for (let k = i - L; k < i && ok; k++) {
      if (lows[k]! <= lo) ok = false;
    }
    for (let k = i + 1; k <= i + R && ok; k++) {
      if (lows[k]! <= lo) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

/**
 * Uses the latest completed pivot high and pivot low indices to infer the most recent impulse leg.
 */
export function lastPivotImpulse(
  highs: number[],
  lows: number[],
  left: number,
  right: number,
): {
  impulseLow: number;
  impulseHigh: number;
  lowIdx: number;
  highIdx: number;
  direction: "up" | "down";
} | null {
  const ph = pivotHighIndices(highs, left, right);
  const pl = pivotLowIndices(lows, left, right);
  if (!ph.length || !pl.length) return null;
  const lastPh = ph[ph.length - 1]!;
  const lastPl = pl[pl.length - 1]!;
  if (lastPh > lastPl) {
    return {
      impulseLow: lows[lastPl]!,
      impulseHigh: highs[lastPh]!,
      lowIdx: lastPl,
      highIdx: lastPh,
      direction: "up",
    };
  }
  return {
    impulseHigh: highs[lastPh]!,
    impulseLow: lows[lastPl]!,
    lowIdx: lastPl,
    highIdx: lastPh,
    direction: "down",
  };
}
