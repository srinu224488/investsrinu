import { describe, expect, it } from "vitest";
import { buildLotSizeMapFromInstrumentsCsv } from "./kite-instrument-lot";

describe("buildLotSizeMapFromInstrumentsCsv", () => {
  it("reads lot_size by tradingsymbol", () => {
    const csv = [
      "instrument_token,tradingsymbol,lot_size",
      "123,BANKNIFTY25APRFUT,30",
      "456,RELIANCE,1",
    ].join("\n");
    const m = buildLotSizeMapFromInstrumentsCsv(csv);
    expect(m.get("BANKNIFTY25APRFUT")).toBe(30);
    expect(m.get("RELIANCE")).toBe(1);
  });
});
