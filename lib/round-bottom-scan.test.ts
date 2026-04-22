import { describe, expect, it } from "vitest";
import type { KiteOhlcBar } from "./kite-historical";
import {
  DEFAULT_ROUND_BOTTOM_PARAMS,
  scoreRoundBottom,
} from "./round-bottom-scan";
import { pivotLowIndices } from "./swing-pivots";

function placeFractalLow(lows: number[], i: number, v: number, wing = 3) {
  for (let k = 1; k <= wing; k++) {
    lows[i - k] = Math.max(lows[i - k] ?? 0, v + 0.55 * k);
    lows[i + k] = Math.max(lows[i + k] ?? 0, v + 0.55 * k);
  }
  lows[i] = v;
}

/** Fractal-friendly lows + terminal breakout (pivot L=R=3). */
function explicitFixture(): KiteOhlcBar[] {
  const n = 130;
  const low: number[] = new Array(n).fill(92);
  for (let i = 0; i < 10; i++) low[i] = 99 - i * 0.4;
  placeFractalLow(low, 15, 94);
  for (let i = 19; i < 35; i++) low[i] = 93 - (i - 19) * 0.35;
  placeFractalLow(low, 40, 74);
  for (let i = 44; i < 52; i++) low[i] = 76 + (i - 44) * 0.25;
  placeFractalLow(low, 56, 77.5);
  for (let i = 60; i < 66; i++) low[i] = 79 + (i - 60) * 0.1;
  placeFractalLow(low, 70, 79.2);
  for (let i = 74; i < 82; i++) low[i] = 81 + (i - 74) * 0.12;
  placeFractalLow(low, 86, 82.5);
  for (let i = 90; i < n - 1; i++) low[i] = 85 + (i - 90) * 0.04;

  const bars: KiteOhlcBar[] = [];
  for (let i = 0; i < n; i++) {
    const l = low[i]!;
    const h = l + 1.1;
    const c = l + 0.55;
    bars.push({
      time: `2024-06-${String((i % 28) + 1).padStart(2, "0")} 00:00:00`,
      open: c,
      high: h,
      low: l,
      close: c,
      volume: 1e6,
    });
  }
  const neck = Math.max(...bars.slice(40, n - 1).map((b) => b.high));
  const last = bars[n - 1]!;
  last.close = neck + 1.8;
  last.high = last.close + 0.3;
  last.low = neck - 0.4;
  last.volume = 2.2e6;
  return bars;
}

describe("scoreRoundBottom", () => {
  it("detects a synthetic U-base with breakout", () => {
    const bars = explicitFixture();
    const lows = bars.map((b) => b.low);
    const pl = pivotLowIndices(lows, 3, 3);
    expect(pl.length).toBeGreaterThan(5);
    expect(pl).toContain(40);
    const r = scoreRoundBottom(bars, {
      ...DEFAULT_ROUND_BOTTOM_PARAMS,
      minDrawdownPct: 0.04,
      minBaseBars: 12,
    });
    expect(r).not.toBeNull();
    expect(r!.breakoutPct).toBeGreaterThan(0);
    expect(r!.higherLowPivots).toBeGreaterThanOrEqual(2);
    expect(r!.compositeScore).toBeGreaterThan(10);
  });

  it("returns null on flat noise", () => {
    const flat: KiteOhlcBar[] = Array.from({ length: 120 }, (_, i) => ({
      time: `2024-02-${String((i % 28) + 1).padStart(2, "0")} 00:00:00`,
      open: 50,
      high: 50.1,
      low: 49.9,
      close: 50,
      volume: 1e5,
    }));
    expect(scoreRoundBottom(flat)).toBeNull();
  });
});
