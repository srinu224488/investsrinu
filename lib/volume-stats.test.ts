import { describe, expect, it } from "vitest";
import { volumeStatsSeries } from "./volume-stats";

describe("volumeStatsSeries", () => {
  it("computes SMA and relative volume", () => {
    const v = [10, 10, 10, 30];
    const s = volumeStatsSeries(v, 2);
    expect(s[1]?.volSma).toBeCloseTo(10, 5);
    expect(s[3]?.relVol).toBeCloseTo(1.5, 5);
  });
});
