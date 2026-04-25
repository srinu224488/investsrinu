import { getMongoDb } from "./mongodb";

export type MongoDbStatus = {
  configured: boolean;
  connected: boolean;
  database?: string;
  /** Present when `configured` is true but ping / connect failed. */
  error?: string;
};

/**
 * Lightweight check for dashboard UI: `MONGODB_URI` set → connect + ping.
 */
export async function getMongoDbStatus(): Promise<MongoDbStatus> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    return { configured: false, connected: false };
  }
  try {
    const db = await getMongoDb();
    if (!db) {
      return {
        configured: true,
        connected: false,
        error: "Database handle unavailable after connect",
      };
    }
    await db.command({ ping: 1 });
    return { configured: true, connected: true, database: db.databaseName };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { configured: true, connected: false, error: message };
  }
}
