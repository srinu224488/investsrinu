import { describe, expect, it } from "vitest";
import { emaConfirmSeries, emaSeries } from "./ema-strategy";

describe("emaSeries", () => {
  it("anchors SMA then applies EMA", () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const e = emaSeries(closes, 3);
    expect(e[0]).toBe(null);
    expect(e[1]).toBe(null);
    expect(e[2]).toBeCloseTo(2, 5);
    expect(e[3]).not.toBe(null);
  });
});

describe("emaConfirmSeries", () => {
  it("flags longEntry after consecutive closes above EMA", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const s = emaConfirmSeries(closes, { length: 5, confirmBars: 2 });
    const last = s[s.length - 1]!;
    expect(last.ema).not.toBe(null);
    expect(last.close).toBe(129);
  });
});
