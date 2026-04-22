import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

const CHUNKS = "kite_instrument_lot_chunks";
/** Keep each chunk under BSON limits for large exchanges (e.g. NFO). */
const ENTRIES_PER_CHUNK = 10_000;

let indexesEnsured = false;

async function ensureKiteInstrumentLotIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  await db
    .collection(CHUNKS)
    .createIndex({ snapshotId: 1, part: 1 }, { unique: true });
  await db.collection(CHUNKS).createIndex({ exchange: 1, fetchedAt: -1 });
}

type LotEntry = { s: string; l: number };

/**
 * Returns a lot map when chunked rows exist for `exchange` and `fetchedAt` is within `ttlMs`.
 */
export async function loadFreshLotMapFromMongo(
  db: Db,
  exchange: string,
  ttlMs: number,
): Promise<Map<string, number> | null> {
  await ensureKiteInstrumentLotIndexes(db);
  const ex = exchange.toUpperCase();
  const cutoff = new Date(Date.now() - ttlMs);
  const head = await db
    .collection(CHUNKS)
    .find({ exchange: ex, fetchedAt: { $gte: cutoff } })
    .sort({ fetchedAt: -1, part: 1 })
    .limit(1)
    .next();
  if (!head || !(head.snapshotId instanceof ObjectId)) return null;
  const snapshotId = head.snapshotId as ObjectId;
  const parts = await db
    .collection(CHUNKS)
    .find({ snapshotId })
    .sort({ part: 1 })
    .toArray();
  if (parts.length === 0) return null;
  const map = new Map<string, number>();
  for (const p of parts) {
    const entries = p.entries;
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      if (typeof o.s !== "string" || typeof o.l !== "number") continue;
      map.set(o.s.toUpperCase(), Math.floor(o.l));
    }
  }
  return map;
}

/**
 * Replaces all lot chunks for `exchange` with a fresh chunked dump from Kite CSV.
 */
export async function saveKiteLotSnapshotToMongo(
  db: Db,
  exchange: string,
  map: Map<string, number>,
): Promise<void> {
  await ensureKiteInstrumentLotIndexes(db);
  const ex = exchange.toUpperCase();
  await db.collection(CHUNKS).deleteMany({ exchange: ex });

  const pairs: LotEntry[] = [];
  for (const [s, l] of map) pairs.push({ s, l });
  if (pairs.length === 0) return;

  const snapshotId = new ObjectId();
  const fetchedAt = new Date();
  const chunkDocs: {
    exchange: string;
    snapshotId: ObjectId;
    part: number;
    fetchedAt: Date;
    entries: LotEntry[];
  }[] = [];
  for (let i = 0, part = 0; i < pairs.length; i += ENTRIES_PER_CHUNK, part++) {
    chunkDocs.push({
      exchange: ex,
      snapshotId,
      part,
      fetchedAt,
      entries: pairs.slice(i, i + ENTRIES_PER_CHUNK),
    });
  }
  await db.collection(CHUNKS).insertMany(chunkDocs);
}
