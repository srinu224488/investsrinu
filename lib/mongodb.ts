import { type Db, MongoClient } from "mongodb";

type GlobalMongo = typeof globalThis & { __kiteobMongoDb?: Promise<Db> };

const DEFAULT_DB = "zerodha";

/**
 * Database: `zerodha` by default, or `MONGODB_DB` when set. Collections: `webhook_events`, `webhook_error_log`, `webhook_placement_log`, `kite_webhook_access` (optional `webhookSecret` for TV), `open_order_snapshots`, `kite_instrument_lot_chunks`.
 * Resolves `null` when `MONGODB_URI` is unset (in-memory webhook store only).
 */
export async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;

  const g = globalThis as GlobalMongo;
  if (!g.__kiteobMongoDb) {
    const client = new MongoClient(uri);
    g.__kiteobMongoDb = client.connect().then((c) => {
      const name = process.env.MONGODB_DB?.trim() || DEFAULT_DB;
      return c.db(name);
    });
  }
  return g.__kiteobMongoDb;
}
