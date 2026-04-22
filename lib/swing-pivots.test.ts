import { describe, expect, it } from "vitest";
import {
  lastPivotImpulse,
  pivotHighIndices,
  pivotLowIndices,
} from "./swing-pivots";

describe("pivotHighIndices", () => {
  it("finds a simple peak", () => {
    const h = [1, 2, 5, 2, 1];
    expect(pivotHighIndices(h, 1, 1)).toContain(2);
  });
});

describe("lastPivotImpulse", () => {
  it("returns bounded impulse when pivots exist", () => {
    const highs = [2, 3, 9, 8, 7, 14, 13, 12, 11];
    const lows = [1, 2, 8, 7.5, 6.5, 13, 12, 11, 10];
    const imp = lastPivotImpulse(highs, lows, 2, 2);
    expect(imp).not.toBe(null);
    expect(imp!.impulseLow).toBeLessThan(imp!.impulseHigh);
  });
});
