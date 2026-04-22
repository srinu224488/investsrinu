import { kiteGetText } from "./kite-client";
import {
  loadFreshLotMapFromMongo,
  saveKiteLotSnapshotToMongo,
} from "./kite-instrument-lot-mongo";
import { getMongoDb } from "./mongodb";
import { parseCsvRows } from "./kite-instruments";

function instrumentsCacheTtlMs(): number {
  const raw = process.env.KITE_INSTRUMENTS_CACHE_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 60_000) return Math.floor(n);
  }
  return 24 * 60 * 60 * 1000;
}

/**
 * Parses Kite `GET /instruments/:exchange` CSV and maps `tradingsymbol` → `lot_size`.
 * Symbols are stored uppercase for lookup.
 */
export function buildLotSizeMapFromInstrumentsCsv(csvText: string): Map<string, number> {
  const map = new Map<string, number>();
  const rows = parseCsvRows(csvText.trim());
  if (rows.length < 2) return map;
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const ti = header.indexOf("tradingsymbol");
  const li = header.indexOf("lot_size");
  if (ti < 0 || li < 0) return map;
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r]!;
    if (line.length <= Math.max(ti, li)) continue;
    const sym = line[ti]?.trim();
    if (!sym) continue;
    const lot = Math.floor(Number(line[li]?.trim()));
    if (!Number.isFinite(lot) || lot < 1) continue;
    map.set(sym.toUpperCase(), lot);
  }
  return map;
}

/**
 * Lot map for an exchange: served from MongoDB when `MONGODB_URI` is set (TTL
 * `KITE_INSTRUMENTS_CACHE_MS`), otherwise refetched from Kite on every call (no in-memory cache).
 */
export async function getKiteLotSizeMap(
  accessToken: string,
  exchange: string,
): Promise<Map<string, number>> {
  const ex = exchange.toUpperCase();
  const ttl = instrumentsCacheTtlMs();
  const db = await getMongoDb();
  if (db) {
    const fromDb = await loadFreshLotMapFromMongo(db, ex, ttl);
    if (fromDb && fromDb.size > 0) return fromDb;
  }

  const text = await kiteGetText(`/instruments/${encodeURIComponent(ex)}`, accessToken);
  const bySymbol = buildLotSizeMapFromInstrumentsCsv(text);
  if (db && bySymbol.size > 0) {
    await saveKiteLotSnapshotToMongo(db, ex, bySymbol);
  }
  return bySymbol;
}

export async function getKiteInstrumentLotSize(
  accessToken: string,
  exchange: string,
  tradingsymbol: string,
): Promise<number | null> {
  const map = await getKiteLotSizeMap(accessToken, exchange);
  return map.get(tradingsymbol.trim().toUpperCase()) ?? null;
}
