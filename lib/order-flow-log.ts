import { randomUUID } from "crypto";
import type { Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongodb";

/**
 * Every step in the order lifecycle for a single webhook event.
 *
 * webhook_received      → TradingView message arrived
 * position_check        → checking for existing orders/positions before entry
 * exit_cancelled        → pending order cancelled (pre-entry cleanup)
 * exit_order_placed     → market exit order sent to close open position
 * order_placed          → new entry order accepted by Kite
 * order_rejected        → Kite rejected the new entry order
 * order_skipped         → entry skipped (token missing, validation failed, etc.)
 */
export type OrderFlowStep =
  | "webhook_received"
  | "position_check"
  | "exit_cancelled"
  | "exit_order_placed"
  | "order_placed"
  | "order_rejected"
  | "order_skipped";

export type OrderFlowLogRow = {
  id: string;
  /** ISO timestamp of when this step occurred. */
  at: string;
  webhook_event_id: string;
  step: OrderFlowStep;
  tradingsymbol?: string;
  exchange?: string;
  product?: string;
  /** BUY | SELL */
  transaction_type?: string;
  /** MARKET | LIMIT | SL | SL-M */
  order_type?: string;
  quantity?: number;
  order_id?: string;
  message?: string;
  /** Raw payload sent to Kite for this step (order fields, cancel params, etc.). */
  payload?: unknown;
  /** Raw response envelope received from Kite for this step. */
  response?: unknown;
};

export type OrderFlowLogPage = {
  rows: OrderFlowLogRow[];
  total: number;
  limit: number;
  offset: number;
  collection: string;
  storage: "mongodb" | "memory";
  database: string | null;
};

export type AppendOrderFlowLogInput = {
  webhook_event_id: string;
  step: OrderFlowStep;
  tradingsymbol?: string;
  exchange?: string;
  product?: string;
  transaction_type?: string;
  order_type?: string;
  quantity?: number;
  order_id?: string;
  message?: string;
  /** Raw payload sent to Kite for this step. */
  payload?: unknown;
  /** Raw response envelope received from Kite for this step. */
  response?: unknown;
};

const MAX = 500;
const COLLECTION = "order_flow_log";
const buffer: OrderFlowLogRow[] = [];

function str(v: unknown): string {
  return String(v ?? "").trim();
}

const VALID_STEPS = new Set<OrderFlowStep>([
  "webhook_received",
  "position_check",
  "exit_cancelled",
  "exit_order_placed",
  "order_placed",
  "order_rejected",
  "order_skipped",
]);

function parseStep(raw: unknown): OrderFlowStep {
  const s = str(raw) as OrderFlowStep;
  return VALID_STEPS.has(s) ? s : "order_skipped";
}

function atFromDoc(doc: WithId<Document>): string {
  const a = doc.at;
  if (a instanceof Date) return a.toISOString();
  if (typeof a === "string" || typeof a === "number") {
    const d = new Date(a);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (doc._id instanceof ObjectId) return doc._id.getTimestamp().toISOString();
  return new Date().toISOString();
}

function numFromDoc(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function mongoDocToRow(d: WithId<Document>): OrderFlowLogRow {
  return {
    id: d._id instanceof ObjectId ? d._id.toHexString() : String(d._id),
    at: atFromDoc(d),
    webhook_event_id: str(d.webhook_event_id),
    step: parseStep(d.step),
    tradingsymbol: str(d.tradingsymbol) || undefined,
    exchange: str(d.exchange) || undefined,
    product: str(d.product) || undefined,
    transaction_type: str(d.transaction_type) || undefined,
    order_type: str(d.order_type) || undefined,
    quantity: numFromDoc(d.quantity),
    order_id: str(d.order_id) || undefined,
    message: str(d.message) || undefined,
    payload: d.payload ?? undefined,
    response: d.response ?? undefined,
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
 * Append a single step to the order flow log. Does not throw.
 */
export async function appendOrderFlowLog(
  input: AppendOrderFlowLogInput,
): Promise<void> {
  try {
    const at = new Date();
    const doc = {
      at,
      webhook_event_id: input.webhook_event_id,
      step: input.step,
      ...(input.tradingsymbol ? { tradingsymbol: input.tradingsymbol } : {}),
      ...(input.exchange ? { exchange: input.exchange } : {}),
      ...(input.product ? { product: input.product } : {}),
      ...(input.transaction_type
        ? { transaction_type: input.transaction_type }
        : {}),
      ...(input.order_type ? { order_type: input.order_type } : {}),
      ...(input.quantity != null ? { quantity: input.quantity } : {}),
      ...(input.order_id ? { order_id: input.order_id } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.response !== undefined ? { response: input.response } : {}),
    };

    const db = await getMongoDb();
    if (db) {
      await db.collection(COLLECTION).insertOne(doc);
      return;
    }

    const row: OrderFlowLogRow = {
      id: randomUUID(),
      at: at.toISOString(),
      webhook_event_id: input.webhook_event_id,
      step: input.step,
      tradingsymbol: input.tradingsymbol,
      exchange: input.exchange,
      product: input.product,
      transaction_type: input.transaction_type,
      order_type: input.order_type,
      quantity: input.quantity,
      order_id: input.order_id,
      message: input.message,
      payload: input.payload,
      response: input.response,
    };
    buffer.unshift(row);
    if (buffer.length > MAX) buffer.length = MAX;
  } catch {
    // never break the webhook flow
  }
}

/**
 * All steps for a given webhook_event_id, oldest first.
 */
export async function getOrderFlowForEvent(
  webhookEventId: string,
): Promise<OrderFlowLogRow[]> {
  const db = await getMongoDb();
  if (db) {
    const docs = await db
      .collection(COLLECTION)
      .find({ webhook_event_id: webhookEventId })
      .sort({ _id: 1 })
      .toArray();
    return docs.map(mongoDocToRow);
  }
  return buffer
    .filter((r) => r.webhook_event_id === webhookEventId)
    .slice()
    .reverse();
}

/**
 * Paginated list. When scoped to a single event, rows are oldest-first so the
 * flow reads chronologically. Without an event filter, rows are newest-first.
 */
export async function listOrderFlowLogPage(params?: {
  limit?: number;
  offset?: number;
  webhook_event_id?: string;
}): Promise<OrderFlowLogPage> {
  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);
  const filter = params?.webhook_event_id
    ? { webhook_event_id: params.webhook_event_id }
    : {};
  const sortDir = params?.webhook_event_id ? 1 : -1;

  const db = await getMongoDb();
  if (db) {
    const coll = db.collection(COLLECTION);
    const [total, docs] = await Promise.all([
      coll.countDocuments(filter),
      coll.find(filter).sort({ _id: sortDir }).skip(offset).limit(limit).toArray(),
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

  const src = params?.webhook_event_id
    ? buffer.filter((r) => r.webhook_event_id === params.webhook_event_id).slice().reverse()
    : buffer;
  return {
    rows: src.slice(offset, offset + limit),
    total: src.length,
    limit,
    offset,
    collection: COLLECTION,
    storage: "memory",
    database: null,
  };
}
