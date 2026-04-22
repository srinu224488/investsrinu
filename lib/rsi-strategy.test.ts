import { describe, expect, it } from "vitest";
import { rsiWilderSeries, rsiWithDivergenceSeries } from "./rsi-strategy";

describe("rsiWilderSeries", () => {
  it("returns null until period bars", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 0.1);
    const r = rsiWilderSeries(closes, 14);
    expect(r[13]).toBe(null);
    expect(r[14]).not.toBe(null);
  });
});

describe("rsiWithDivergenceSeries", () => {
  it("returns series aligned with closes", () => {
    const n = 40;
    const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const s = rsiWithDivergenceSeries(closes, highs, lows, {
      period: 14,
      pivotLeft: 2,
      pivotRight: 2,
    });
    expect(s.length).toBe(n);
    expect(s[n - 1]?.close).toBe(closes[n - 1]);
  });
});
