import type { KiteOhlcBar } from "./kite-historical";

export type HtfZoneRow = {
  time: string;
  source: "open" | "high" | "low" | "close";
  price: number;
};

/** Each bar becomes four S/R-style price levels (higher-timeframe context). */
export function barsToHtfZoneRows(bars: KiteOhlcBar[]): HtfZoneRow[] {
  const out: HtfZoneRow[] = [];
  for (const b of bars) {
    out.push({ time: b.time, source: "open", price: b.open });
    out.push({ time: b.time, source: "high", price: b.high });
    out.push({ time: b.time, source: "low", price: b.low });
    out.push({ time: b.time, source: "close", price: b.close });
  }
  return out;
}
