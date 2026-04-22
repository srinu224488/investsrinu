/** Common Fibonacci retracement ratios (impulse low → high or high → low). */
export const FIB_RETRACEMENT_RATIOS = [
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
] as const;

export type FibLevelRow = {
  ratio: number;
  price: number;
};

/**
 * Impulse from `impulseLow` to `impulseHigh` (numeric order does not matter).
 * Retracements are computed between the two extremes; `direction` describes how price moved along the impulse.
 */
export function fibRetracementLevels(
  impulseLow: number,
  impulseHigh: number,
  direction: "up" | "down",
): FibLevelRow[] {
  const lo = Math.min(impulseLow, impulseHigh);
  const hi = Math.max(impulseLow, impulseHigh);
  const range = hi - lo;
  if (!Number.isFinite(range) || range <= 0) {
    return FIB_RETRACEMENT_RATIOS.map((ratio) => ({
      ratio,
      price: lo,
    }));
  }

  if (direction === "up") {
    return FIB_RETRACEMENT_RATIOS.map((ratio) => ({
      ratio,
      price: hi - ratio * range,
    }));
  }

  return FIB_RETRACEMENT_RATIOS.map((ratio) => ({
    ratio,
    price: lo + ratio * range,
  }));
}
