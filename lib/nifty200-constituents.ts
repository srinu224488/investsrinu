import { parseCsvRows } from "./kite-instruments";
import type { KiteEqInstrument } from "./kite-instruments";

/** Official NSE index constituent file (CNX / Nifty 200). */
export const NIFTY200_CSV_URL =
  "https://nsearchives.nseindia.com/content/indices/ind_nifty200list.csv";

/**
 * Parse `ind_nifty200list.csv`: header includes Symbol, Series — keep EQ rows only.
 */
export function parseNifty200SymbolsFromCsv(text: string): string[] {
  const rows = parseCsvRows(text.trim());
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  const symIdx = header.findIndex((h) => h.toLowerCase() === "symbol");
  const serIdx = header.findIndex((h) => h.toLowerCase() === "series");
  if (symIdx < 0) return [];

  const out: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.length <= symIdx) continue;
    const sym = row[symIdx]!.trim().toUpperCase();
    if (!sym) continue;
    if (serIdx >= 0 && row[serIdx] && row[serIdx]!.trim().toUpperCase() !== "EQ") {
      continue;
    }
    out.push(sym);
  }
  return out;
}

export async function fetchNifty200SymbolList(): Promise<string[]> {
  const res = await fetch(NIFTY200_CSV_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; kiteob/1.0) AppleWebKit/537.36 (KHTML, like Gecko)",
      Accept: "text/csv,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`NSE Nifty 200 CSV HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseNifty200SymbolsFromCsv(text);
}

/**
 * Map Nifty 200 order → Kite NSE EQ instruments; caps at `maxSymbols`.
 */
export function matchNifty200ToKiteInstruments(
  niftyOrder: string[],
  nseEq: KiteEqInstrument[],
  maxSymbols: number,
): { universe: KiteEqInstrument[]; unmatched: string[] } {
  const bySym = new Map<string, KiteEqInstrument>();
  for (const inst of nseEq) {
    bySym.set(inst.tradingsymbol.toUpperCase(), inst);
  }

  const universe: KiteEqInstrument[] = [];
  const unmatched: string[] = [];

  for (const sym of niftyOrder) {
    if (universe.length >= maxSymbols) break;
    const inst = bySym.get(sym);
    if (inst) universe.push(inst);
    else unmatched.push(sym);
  }

  return { universe, unmatched };
}
