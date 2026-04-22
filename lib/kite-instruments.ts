import { kiteGetText } from "./kite-client";

export type KiteEqInstrument = {
  instrument_token: number;
  exchange: "NSE" | "BSE";
  tradingsymbol: string;
  /** `NSE:SYMBOL` */
  instrumentKey: string;
};

/** Minimal RFC-style CSV parse (handles quoted fields). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function headerIndex(header: string[], name: string): number {
  const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return i;
}

/**
 * Cash equity rows for one exchange (Kite `instrument_type` EQ).
 */
export function parseKiteEqInstrumentsFromCsv(
  csvText: string,
  exchange: "NSE" | "BSE",
): KiteEqInstrument[] {
  const rows = parseCsvRows(csvText.trim());
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  const ti = headerIndex(header, "instrument_token");
  const tsym = headerIndex(header, "tradingsymbol");
  const itype = headerIndex(header, "instrument_type");
  if (ti < 0 || tsym < 0 || itype < 0) return [];

  const out: KiteEqInstrument[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r]!;
    if (line.length <= Math.max(ti, tsym, itype)) continue;
    if (line[itype]!.trim().toUpperCase() !== "EQ") continue;
    const token = Number(line[ti]!.trim());
    const sym = line[tsym]!.trim();
    if (!Number.isFinite(token) || !sym) continue;
    out.push({
      instrument_token: token,
      exchange,
      tradingsymbol: sym,
      instrumentKey: `${exchange}:${sym}`,
    });
  }
  return out;
}

export async function fetchKiteEqInstruments(
  accessToken: string,
  exchange: "NSE" | "BSE",
): Promise<KiteEqInstrument[]> {
  const text = await kiteGetText(`/instruments/${exchange}`, accessToken);
  return parseKiteEqInstrumentsFromCsv(text, exchange);
}
