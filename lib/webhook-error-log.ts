import { randomUUID } from "crypto";
import type { Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongodb";

export type WebhookErrorLogSource = "tradingview_webhook";

export type WebhookErrorLogRow = {
  id: string;
  loggedAt: string;
  source: WebhookErrorLogSource;
  message: string;
  error_type?: string;
  webhook_event_id?: string;
  detail?: Record<string, unknown>;
};

export type WebhookErrorLogPageMeta = {
  total: number;
  limit: number;
  offset: number;
  collection: string;
  storage: "mongodb" | "memory";
  database: string | null;
};

export type WebhookErrorLogPage = WebhookErrorLogPageMeta & {
  errors: WebhookErrorLogRow[];
};

const MAX = 200;
const COLLECTION = "webhook_error_log";
const buffer: WebhookErrorLogRow[] = [];

function loggedAtFromDoc(doc: WithId<Document>): string {
  const ra = doc.loggedAt;
  if (ra instanceof Date) return ra.toISOString();
  if (typeof ra === "string" || typeof ra === "number") {
    const d = new Date(ra);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (doc._id instanceof ObjectId) return doc._id.getTimestamp().toISOString();
  return new Date().toISOString();
}

function detailFromDoc(doc: WithId<Document>): Record<string, unknown> | undefined {
  const d = doc.detail;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    return d as Record<string, unknown>;
  }
  return undefined;
}

function mongoDocToRow(d: WithId<Document>): WebhookErrorLogRow {
  const src = typeof d.source === "string" ? d.source : "";
  const source = (src === "tradingview_webhook"
    ? src
    : "tradingview_webhook") as WebhookErrorLogSource;
  return {
    id: d._id instanceof ObjectId ? d._id.toHexString() : String(d._id),
    loggedAt: loggedAtFromDoc(d),
    source,
    message: String(d.message ?? "").trim() || "—",
    error_type:
      typeof d.error_type === "string" && d.error_type.trim()
        ? d.error_type.trim()
        : undefined,
    webhook_event_id:
      typeof d.webhook_event_id === "string" && d.webhook_event_id.trim()
        ? d.webhook_event_id.trim()
        : undefined,
    detail: detailFromDoc(d),
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

export type AppendWebhookErrorLogInput = {
  source: WebhookErrorLogSource;
  message: string;
  error_type?: string;
  webhook_event_id?: string;
  detail?: Record<string, unknown>;
};

/**
 * Persists a webhook-side failure for the UI. Does not throw (logging must not break webhooks).
 */
export async function appendWebhookErrorLog(
  input: AppendWebhookErrorLogInput,
): Promise<void> {
  try {
    const db = await getMongoDb();
    const loggedAt = new Date();
    const doc = {
      loggedAt,
      source: input.source,
      message: input.message,
      ...(input.error_type ? { error_type: input.error_type } : {}),
      ...(input.webhook_event_id
        ? { webhook_event_id: input.webhook_event_id }
        : {}),
      ...(input.detail && Object.keys(input.detail).length > 0
        ? { detail: input.detail }
        : {}),
    };

    if (db) {
      await db.collection(COLLECTION).insertOne(doc);
      return;
    }

    const row: WebhookErrorLogRow = {
      id: randomUUID(),
      loggedAt: loggedAt.toISOString(),
      source: input.source,
      message: input.message,
      error_type: input.error_type,
      webhook_event_id: input.webhook_event_id,
      detail: input.detail,
    };
    buffer.unshift(row);
    if (buffer.length > MAX) buffer.length = MAX;
  } catch {
    // ignore persistence failures
  }
}

export async function listWebhookErrorLogPage(params?: {
  limit?: number;
  offset?: number;
}): Promise<WebhookErrorLogPage> {
  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);
  const db = await getMongoDb();

  if (db) {
    const coll = db.collection(COLLECTION);
    const [total, docs] = await Promise.all([
      coll.countDocuments({}),
      coll.find({}).sort({ _id: -1 }).skip(offset).limit(limit).toArray(),
    ]);
    return {
      errors: docs.map(mongoDocToRow),
      total,
      limit,
      offset,
      collection: COLLECTION,
      storage: "mongodb",
      database: db.databaseName,
    };
  }

  const total = buffer.length;
  const errors = buffer.slice(offset, offset + limit);
  return {
    errors,
    total,
    limit,
    offset,
    collection: COLLECTION,
    storage: "memory",
    database: null,
  };
}
