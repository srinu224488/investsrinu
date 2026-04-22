import { randomUUID } from "crypto";
import type { Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongodb";

/** Shape returned to clients (events API, webhook POST ack). */
export type WebhookEvent = {
  id: string;
  receivedAt: string;
  body: unknown;
};

export type WebhookEventsListMeta = {
  total: number;
  limit: number;
  offset: number;
  collection: string;
  storage: "mongodb" | "memory";
  database: string | null;
};

export type WebhookEventsPage = WebhookEventsListMeta & {
  events: WebhookEvent[];
};

const MAX = 200;
const COLLECTION = "webhook_events";
const buffer: WebhookEvent[] = [];

function resolveStoredBody(doc: WithId<Document>): unknown {
  if ("body" in doc && doc.body !== undefined) return doc.body;
  const p = doc.payload;
  if (p !== null && typeof p === "object") {
    const o = p as Record<string, unknown>;
    if (o.source === "tradingview" && "body" in o) return o.body;
  }
  if ("payload" in doc) return doc.payload;
  return null;
}

function receivedAtFromDoc(doc: WithId<Document>): string {
  const ra = doc.receivedAt;
  if (ra instanceof Date) return ra.toISOString();
  if (typeof ra === "string" || typeof ra === "number") {
    const d = new Date(ra);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (doc._id instanceof ObjectId) return doc._id.getTimestamp().toISOString();
  return new Date().toISOString();
}

function mongoDocToEvent(d: WithId<Document>): WebhookEvent {
  return {
    id: d._id instanceof ObjectId ? d._id.toHexString() : String(d._id),
    receivedAt: receivedAtFromDoc(d),
    body: resolveStoredBody(d),
  };
}

function clampLimit(raw: number | undefined): number {
  const n = raw === undefined ? 50 : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, MAX);
}

function clampOffset(raw: number | undefined): number {
  const n = raw === undefined ? 0 : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function appendWebhookEvent(body: unknown): Promise<WebhookEvent> {
  const db = await getMongoDb();

  if (db) {
    const result = await db.collection(COLLECTION).insertOne({ body });
    const oid = result.insertedId;
    if (!(oid instanceof ObjectId)) {
      return {
        id: String(oid),
        receivedAt: new Date().toISOString(),
        body,
      };
    }
    return {
      id: oid.toHexString(),
      receivedAt: oid.getTimestamp().toISOString(),
      body,
    };
  }

  const receivedAt = new Date().toISOString();
  const row: WebhookEvent = {
    id: randomUUID(),
    receivedAt,
    body,
  };
  buffer.unshift(row);
  if (buffer.length > MAX) buffer.length = MAX;
  return row;
}

/**
 * Paginated read for review UIs and APIs. Sorted newest first (`_id` desc in MongoDB).
 */
export async function listWebhookEventsPage(params?: {
  limit?: number;
  offset?: number;
}): Promise<WebhookEventsPage> {
  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);
  const db = await getMongoDb();

  if (db) {
    const coll = db.collection(COLLECTION);
    const [total, docs] = await Promise.all([
      coll.countDocuments({}),
      coll.find({}).sort({ _id: -1 }).skip(offset).limit(limit).toArray(),
    ]);
    const databaseName = db.databaseName;
    return {
      events: docs.map(mongoDocToEvent),
      total,
      limit,
      offset,
      collection: COLLECTION,
      storage: "mongodb",
      database: databaseName,
    };
  }

  const total = buffer.length;
  const events = buffer.slice(offset, offset + limit);
  return {
    events,
    total,
    limit,
    offset,
    collection: COLLECTION,
    storage: "memory",
    database: null,
  };
}

export async function listWebhookEvents(): Promise<WebhookEvent[]> {
  const { events } = await listWebhookEventsPage({ limit: MAX, offset: 0 });
  return events;
}
