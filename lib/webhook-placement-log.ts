import { randomUUID } from "crypto";
import type { Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongodb";

export type WebhookPlacementOutcome =
  | "not_placed_invalid_payload"
  | "not_placed_no_token"
  | "not_placed_not_executable"
  | "not_placed_orders_fetch_failed"
  | "not_placed_duplicate"
  | "placed"
  | "not_placed_kite_reject";

export type WebhookPlacementLogRow = {
  id: string;
  createdAt: string;
  webhook_event_id: string;
  outcome: WebhookPlacementOutcome;
  order_id?: string;
  message?: string;
  error_type?: string;
  exchange?: string;
  tradingsymbol?: string;
  product?: string;
  transaction_type?: string;
  quantity?: number;
};

export type WebhookPlacementLogPage = {
  rows: WebhookPlacementLogRow[];
  total: number;
  limit: number;
  offset: number;
  collection: string;
  storage: "mongodb" | "memory";
  database: string | null;
};

const MAX = 200;
const COLLECTION = "webhook_placement_log";
const buffer: WebhookPlacementLogRow[] = [];

export type AppendWebhookPlacementInput = {
  webhook_event_id: string;
  outcome: WebhookPlacementOutcome;
  order_id?: string;
  message?: string;
  error_type?: string;
  intent?: {
    exchange?: string;
    tradingsymbol?: string;
    product?: string;
    transaction_type?: string;
    quantity?: number;
  };
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function createdAtFromDoc(doc: WithId<Document>): string {
  const ca = doc.createdAt;
  if (ca instanceof Date) return ca.toISOString();
  if (typeof ca === "string" || typeof ca === "number") {
    const d = new Date(ca);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (doc._id instanceof ObjectId) return doc._id.getTimestamp().toISOString();
  return new Date().toISOString();
}

function parseOutcome(raw: unknown): WebhookPlacementOutcome {
  const s = str(raw);
  const allowed: WebhookPlacementOutcome[] = [
    "not_placed_invalid_payload",
    "not_placed_no_token",
    "not_placed_not_executable",
    "not_placed_orders_fetch_failed",
    "not_placed_duplicate",
    "placed",
    "not_placed_kite_reject",
  ];
  return (allowed.includes(s as WebhookPlacementOutcome)
    ? s
    : "not_placed_invalid_payload") as WebhookPlacementOutcome;
}

function mongoDocToRow(d: WithId<Document>): WebhookPlacementLogRow {
  const id = d._id instanceof ObjectId ? d._id.toHexString() : String(d._id);
  const q = d.quantity;
  const quantity =
    typeof q === "number" && Number.isFinite(q)
      ? Math.floor(q)
      : typeof q === "string" && q.trim()
        ? Math.floor(Number(q))
        : undefined;
  return {
    id,
    createdAt: createdAtFromDoc(d),
    webhook_event_id: str(d.webhook_event_id),
    outcome: parseOutcome(d.outcome),
    order_id: str(d.order_id) || undefined,
    message: str(d.message) || undefined,
    error_type: str(d.error_type) || undefined,
    exchange: str(d.exchange) || undefined,
    tradingsymbol: str(d.tradingsymbol) || undefined,
    product: str(d.product) || undefined,
    transaction_type: str(d.transaction_type) || undefined,
    quantity: quantity !== undefined && Number.isFinite(quantity) ? quantity : undefined,
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

/**
 * One row per TradingView webhook run (success or failure). Does not throw.
 */
export async function appendWebhookPlacementLog(
  input: AppendWebhookPlacementInput,
): Promise<void> {
  try {
    const createdAt = new Date();
    const intent = input.intent;
    const flat = {
      createdAt,
      webhook_event_id: input.webhook_event_id,
      outcome: input.outcome,
      ...(input.order_id ? { order_id: input.order_id } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.error_type ? { error_type: input.error_type } : {}),
      ...(intent?.exchange ? { exchange: intent.exchange } : {}),
      ...(intent?.tradingsymbol ? { tradingsymbol: intent.tradingsymbol } : {}),
      ...(intent?.product ? { product: intent.product } : {}),
      ...(intent?.transaction_type
        ? { transaction_type: intent.transaction_type }
        : {}),
      ...(intent?.quantity != null ? { quantity: intent.quantity } : {}),
    };

    const db = await getMongoDb();
    if (db) {
      await db.collection(COLLECTION).insertOne(flat);
      return;
    }

    const row: WebhookPlacementLogRow = {
      id: randomUUID(),
      createdAt: createdAt.toISOString(),
      webhook_event_id: input.webhook_event_id,
      outcome: input.outcome,
      order_id: input.order_id,
      message: input.message,
      error_type: input.error_type,
      exchange: intent?.exchange,
      tradingsymbol: intent?.tradingsymbol,
      product: intent?.product,
      transaction_type: intent?.transaction_type,
      quantity: intent?.quantity,
    };
    buffer.unshift(row);
    if (buffer.length > MAX) buffer.length = MAX;
  } catch {
    // ignore
  }
}

/** Non-empty after trim — matches rows we can show a symbol for in automated-orders. */
function hasTradingsymbol(r: WebhookPlacementLogRow): boolean {
  return Boolean(str(r.tradingsymbol));
}

/** Mongo filter: document has a non-empty tradingsymbol string. */
const TRADINGSYMBOL_PRESENT_FILTER = {
  tradingsymbol: { $regex: /\S/ },
} as const;

export async function listWebhookPlacementLogPage(params?: {
  limit?: number;
  offset?: number;
  /** When true, only rows with a non-empty tradingsymbol (automated-orders table). */
  requireTradingsymbol?: boolean;
}): Promise<WebhookPlacementLogPage> {
  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);
  const requireSym = Boolean(params?.requireTradingsymbol);
  const db = await getMongoDb();

  if (db) {
    const coll = db.collection(COLLECTION);
    const q = requireSym ? TRADINGSYMBOL_PRESENT_FILTER : {};
    const [total, docs] = await Promise.all([
      coll.countDocuments(q),
      coll
        .find(q)
        .sort({ _id: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);
    return {
      rows: docs.map(mongoDocToRow),
      total,
      limit,
      offset,
      collection: COLLECTION,
      storage: "mongodb",
      database: db.databaseName,
    };
  }

  const src = requireSym ? buffer.filter(hasTradingsymbol) : buffer;
  const total = src.length;
  const rows = src.slice(offset, offset + limit);
  return {
    rows,
    total,
    limit,
    offset,
    collection: COLLECTION,
    storage: "memory",
    database: null,
  };
}
