import { describe, expect, it } from "vitest";
import { parseNifty200SymbolsFromCsv } from "./nifty200-constituents";

describe("parseNifty200SymbolsFromCsv", () => {
  it("parses Symbol column and EQ series", () => {
    const csv = `Company Name,Industry,Symbol,Series,ISIN Code
Foo Ltd.,X,RELIANCE,EQ,INE002A01018
Bar Ltd.,Y,BAD,BE,INE000`;
    const syms = parseNifty200SymbolsFromCsv(csv);
    expect(syms).toEqual(["RELIANCE"]);
  });
});
