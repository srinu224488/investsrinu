import { describe, expect, it } from "vitest";
import { fibRetracementLevels } from "./fib-levels";

describe("fibRetracementLevels", () => {
  it("up impulse places 0.5 midway", () => {
    const lv = fibRetracementLevels(100, 200, "up");
    const mid = lv.find((x) => x.ratio === 0.5);
    expect(mid?.price).toBeCloseTo(150, 5);
  });

  it("down impulse retraces upward from low", () => {
    const lv = fibRetracementLevels(100, 200, "down");
    const mid = lv.find((x) => x.ratio === 0.5);
    expect(mid?.price).toBeCloseTo(150, 5);
  });
});
