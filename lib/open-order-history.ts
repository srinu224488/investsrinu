import { randomUUID } from "crypto";
import type { Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { kiteGet } from "./kite-client";
import { getMongoDb } from "./mongodb";

/** Matches Kite “open” book: not in an end state. */
const TERMINAL_STATUS = new Set([
  "COMPLETE",
  "CANCELLED",
  "REJECTED",
  "CANCELLED AMO",
]);

const COLLECTION = "open_order_snapshots";
const MAX_MEMORY = 150;

export type OpenOrderSnapshotRow = {
  order_id: string;
  order_timestamp: string | null;
  transaction_type: string;
  tradingsymbol: string;
  exchange: string;
  product: string;
  quantity: number;
  filled_quantity: number;
  pending_quantity: number;
  price: number;
  order_type: string;
  status: string;
};

export type OpenOrderSnapshot = {
  id: string;
  capturedAt: string;
  source: string;
  webhook_event_id?: string;
  orders: OpenOrderSnapshotRow[];
};

export type OpenOrderHistoryPage = {
  snapshots: OpenOrderSnapshot[];
  total: number;
  limit: number;
  offset: number;
  collection: string;
  storage: "mongodb" | "memory";
  database: string | null;
};

type MemorySnap = OpenOrderSnapshot;
const memoryBuffer: MemorySnap[] = [];

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isOpenKiteRow(o: Record<string, unknown>): boolean {
  const st = str(o.status).toUpperCase();
  if (!st) return false;
  return !TERMINAL_STATUS.has(st);
}

function rowFromKite(o: Record<string, unknown>): OpenOrderSnapshotRow | null {
  const order_id = str(o.order_id);
  if (!order_id) return null;
  return {
    order_id,
    order_timestamp: str(o.order_timestamp) || null,
    transaction_type: str(o.transaction_type).toUpperCase() || "—",
    tradingsymbol: str(o.tradingsymbol).toUpperCase() || "—",
    exchange: str(o.exchange).toUpperCase() || "—",
    product: str(o.product).toUpperCase() || "—",
    quantity: num(o.quantity),
    filled_quantity: num(o.filled_quantity),
    pending_quantity: num(o.pending_quantity),
    price: num(o.price),
    order_type: str(o.order_type).toUpperCase() || "—",
    status: str(o.status) || "—",
  };
}

/** Map Kite GET /orders list to open-book rows only. */
export function openRowsFromKiteOrderList(orders: unknown[]): OpenOrderSnapshotRow[] {
  const out: OpenOrderSnapshotRow[] = [];
  if (!Array.isArray(orders)) return out;
  for (const raw of orders) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    if (!isOpenKiteRow(o)) continue;
    const row = rowFromKite(o);
    if (row) out.push(row);
  }
  return out;
}

/** Stable signature of the open book so back-to-back refreshes do not store duplicate snapshots. */
export function openBookFingerprint(rows: OpenOrderSnapshotRow[]): string {
  const sorted = [...rows].sort((a, b) => a.order_id.localeCompare(b.order_id));
  return JSON.stringify(
    sorted.map((r) => ({
      order_id: r.order_id,
      status: r.status,
      transaction_type: r.transaction_type,
      tradingsymbol: r.tradingsymbol,
      exchange: r.exchange,
      product: r.product,
      quantity: r.quantity,
      filled_quantity: r.filled_quantity,
      pending_quantity: r.pending_quantity,
      price: r.price,
      order_type: r.order_type,
      order_timestamp: r.order_timestamp ?? "",
    })),
  );
}

async function latestStoredOpenBookFingerprint(): Promise<string | null> {
  const db = await getMongoDb();
  if (db) {
    const doc = await db
      .collection(COLLECTION)
      .findOne({}, { sort: { _id: -1 }, projection: { orders: 1 } });
    if (!doc || !Array.isArray(doc.orders)) return null;
    return openBookFingerprint(doc.orders as OpenOrderSnapshotRow[]);
  }
  if (memoryBuffer.length === 0) return null;
  return openBookFingerprint(memoryBuffer[0].orders);
}

export async function persistOpenOrderSnapshot(
  source: string,
  orders: unknown[],
  meta?: { webhook_event_id?: string },
): Promise<OpenOrderSnapshot | null> {
  const rows = openRowsFromKiteOrderList(orders);
  const fp = openBookFingerprint(rows);
  const prev = await latestStoredOpenBookFingerprint();
  if (prev !== null && fp === prev) {
    return null;
  }

  const capturedAt = new Date().toISOString();
  const db = await getMongoDb();

  if (db) {
    const doc: Document = {
      capturedAt: new Date(capturedAt),
      source,
      orders: rows,
    };
    if (meta?.webhook_event_id) doc.webhook_event_id = meta.webhook_event_id;
    const result = await db.collection(COLLECTION).insertOne(doc);
    const oid = result.insertedId;
    const id =
      oid instanceof ObjectId ? oid.toHexString() : String(oid);
    return {
      id,
      capturedAt:
        oid instanceof ObjectId ? oid.getTimestamp().toISOString() : capturedAt,
      source,
      webhook_event_id: meta?.webhook_event_id,
      orders: rows,
    };
  }

  const snap: OpenOrderSnapshot = {
    id: randomUUID(),
    capturedAt,
    source,
    webhook_event_id: meta?.webhook_event_id,
    orders: rows,
  };
  memoryBuffer.unshift(snap);
  if (memoryBuffer.length > MAX_MEMORY) memoryBuffer.length = MAX_MEMORY;
  return snap;
}

/** GET /orders then persist open-book snapshot (e.g. after webhook placement). */
export async function persistOpenOrderSnapshotFromKite(
  accessToken: string,
  source: string,
  meta?: { webhook_event_id?: string },
): Promise<OpenOrderSnapshot | null> {
  try {
    const orders = await kiteGet<unknown[]>("/orders", accessToken);
    return persistOpenOrderSnapshot(source, orders ?? [], meta);
  } catch {
    return null;
  }
}

function docToSnapshot(d: WithId<Document>): OpenOrderSnapshot {
  const id = d._id instanceof ObjectId ? d._id.toHexString() : String(d._id);
  let capturedAt = new Date().toISOString();
  const ca = d.capturedAt;
  if (ca instanceof Date) capturedAt = ca.toISOString();
  else if (typeof ca === "string" || typeof ca === "number") {
    const t = new Date(ca);
    if (!Number.isNaN(t.getTime())) capturedAt = t.toISOString();
  } else if (d._id instanceof ObjectId) {
    capturedAt = d._id.getTimestamp().toISOString();
  }
  const orders = Array.isArray(d.orders) ? (d.orders as OpenOrderSnapshotRow[]) : [];
  const source = str(d.source) || "unknown";
  const webhook_event_id = str(d.webhook_event_id) || undefined;
  return {
    id,
    capturedAt,
    source,
    webhook_event_id,
    orders,
  };
}

function clampLimit(raw: number | undefined): number {
  const n = raw === undefined ? 30 : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 100);
}

function clampOffset(raw: number | undefined): number {
  const n = raw === undefined ? 0 : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function listOpenOrderHistoryPage(params?: {
  limit?: number;
  offset?: number;
}): Promise<OpenOrderHistoryPage> {
  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);
  const db = await getMongoDb();

  if (db) {
    const coll = db.collection(COLLECTION);
    const [total, docs] = await Promise.all([
      coll.countDocuments({}),
      coll
        .find({})
        .sort({ _id: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);
    return {
      snapshots: docs.map(docToSnapshot),
      total,
      limit,
      offset,
      collection: COLLECTION,
      storage: "mongodb",
      database: db.databaseName,
    };
  }

  const total = memoryBuffer.length;
  const snapshots = memoryBuffer.slice(offset, offset + limit);
  return {
    snapshots,
    total,
    limit,
    offset,
    collection: COLLECTION,
    storage: "memory",
    database: null,
  };
}
