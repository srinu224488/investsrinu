/**
 * Merge live LTP into the current (last) candle for streaming approximations.
 */
export function applyLtpToLastBar(
  highs: number[],
  lows: number[],
  closes: number[],
  ltp: number,
): void {
  const i = closes.length - 1;
  if (i < 0) return;
  closes[i] = ltp;
  highs[i] = Math.max(highs[i]!, ltp);
  lows[i] = Math.min(lows[i]!, ltp);
}
