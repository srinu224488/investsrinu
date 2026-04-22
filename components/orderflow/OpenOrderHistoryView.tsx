"use client";

import type {
  OpenOrderSnapshot,
  OpenOrderSnapshotRow,
} from "@/lib/open-order-history";
import type { TerminalDayOrderRow } from "@/lib/kite-terminal-day-orders";
import type { WebhookOrderIntentRow } from "@/lib/webhook-event-order-intent";
import { useCallback, useEffect, useMemo, useState } from "react";

type OrderflowTab = "alerts" | "open" | "executed_closed";

type SnapshotMeta = {
  total: number;
  limit: number;
  offset: number;
  storage: string;
  database: string | null;
  collection: string;
};

type WebhookMeta = {
  total: number;
  limit: number;
  offset: number;
  storage: string;
  database: string | null;
  collection: string;
};

type OrderflowPayload = {
  snapshots: OpenOrderSnapshot[];
  snapshot_meta: SnapshotMeta;
  webhook_order_intents: WebhookOrderIntentRow[];
  webhook_meta: WebhookMeta;
  terminal_day_orders: TerminalDayOrderRow[];
  kite_day_orders_error?: string;
};

function formatClock(ts: string | null): string {
  if (!ts) return "—";
  const parts = ts.trim().split(/\s+/);
  const tail = parts[parts.length - 1] ?? "";
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(tail)) return tail;
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  return tail || "—";
}

function formatCaptured(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function priceLabel(row: OpenOrderSnapshotRow): string {
  if (row.order_type === "MARKET" && row.price === 0) return "MKT";
  if (row.price > 0) {
    return row.price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return "—";
}

function intentPriceLabel(row: WebhookOrderIntentRow): string {
  if (!row.map_ok) return "—";
  const ot = (row.order_type || "").toUpperCase();
  if (ot === "MARKET" && (row.price == null || row.price === 0)) return "MKT";
  if (row.price != null && row.price > 0) {
    return row.price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return "—";
}

function intentBadge(row: WebhookOrderIntentRow) {
  if (row.map_ok) {
    return (
      <span className="inline-block rounded-full bg-emerald-950 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-800">
        Would place
      </span>
    );
  }
  if (row.map_reason === "skipped_by_flag") {
    return (
      <span className="inline-block rounded-full bg-amber-950 px-2.5 py-0.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-800">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400">
      No order
    </span>
  );
}

function terminalPriceLabel(row: TerminalDayOrderRow): string {
  if (row.order_type === "MARKET" && row.price === 0) return "MKT";
  if (row.price > 0) {
    return row.price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return "—";
}

function avgLabel(row: TerminalDayOrderRow): string {
  if (row.average_price > 0) {
    return row.average_price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return "—";
}

type InstrumentTerminalGroup = {
  instrumentKey: string;
  exchange: string;
  tradingsymbol: string;
  orders: TerminalDayOrderRow[];
};

/** Group by Kite instrument (exchange + tradingsymbol). */
function groupTerminalOrdersByInstrument(
  rows: TerminalDayOrderRow[],
): InstrumentTerminalGroup[] {
  const map = new Map<string, TerminalDayOrderRow[]>();
  for (const row of rows) {
    const key = `${row.exchange}\u0000${row.tradingsymbol}`;
    const cur = map.get(key);
    if (cur) cur.push(row);
    else map.set(key, [row]);
  }
  const groups: InstrumentTerminalGroup[] = [];
  for (const [instrumentKey, orders] of map) {
    const head = orders[0];
    if (!head) continue;
    orders.sort((a, b) => {
      const ta = a.order_timestamp || "";
      const tb = b.order_timestamp || "";
      return tb.localeCompare(ta);
    });
    groups.push({
      instrumentKey,
      exchange: head.exchange,
      tradingsymbol: head.tradingsymbol,
      orders,
    });
  }
  groups.sort((a, b) => {
    const s = a.tradingsymbol.localeCompare(b.tradingsymbol);
    if (s !== 0) return s;
    return a.exchange.localeCompare(b.exchange);
  });
  return groups;
}

const OPEN_OTHER_GROUP_KEY = "\u0000open_other\u0000";

type OpenSnapshotInstrumentGroup = {
  groupKey: string;
  exchange: string;
  tradingsymbol: string;
  isOther: boolean;
  orders: OpenOrderSnapshotRow[];
};

function groupOpenSnapshotOrdersByInstrument(
  rows: OpenOrderSnapshotRow[],
): OpenSnapshotInstrumentGroup[] {
  const map = new Map<string, OpenOrderSnapshotRow[]>();
  for (const row of rows) {
    const ex = (row.exchange ?? "").trim();
    const sym = (row.tradingsymbol ?? "").trim();
    const key = ex && sym ? `${ex}\u0000${sym}` : OPEN_OTHER_GROUP_KEY;
    const cur = map.get(key);
    if (cur) cur.push(row);
    else map.set(key, [row]);
  }
  const groups: OpenSnapshotInstrumentGroup[] = [];
  for (const [groupKey, orders] of map) {
    const head = orders[0];
    if (!head) continue;
    orders.sort((a, b) => {
      const ta = a.order_timestamp || "";
      const tb = b.order_timestamp || "";
      return tb.localeCompare(ta);
    });
    if (groupKey === OPEN_OTHER_GROUP_KEY) {
      groups.push({
        groupKey,
        exchange: "",
        tradingsymbol: "",
        isOther: true,
        orders,
      });
    } else {
      groups.push({
        groupKey,
        exchange: (head.exchange ?? "").trim(),
        tradingsymbol: (head.tradingsymbol ?? "").trim(),
        isOther: false,
        orders,
      });
    }
  }
  groups.sort((a, b) => {
    if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
    const s = a.tradingsymbol.localeCompare(b.tradingsymbol);
    if (s !== 0) return s;
    return a.exchange.localeCompare(b.exchange);
  });
  return groups;
}

function openGroupCompositeKey(snapshotId: string, groupKey: string): string {
  return `${snapshotId}\u0001${groupKey}`;
}

const ALERT_OTHER_GROUP_KEY = "\u0000other\u0000";

type AlertIntentGroup = {
  groupKey: string;
  exchange: string;
  tradingsymbol: string;
  isOther: boolean;
  rows: WebhookOrderIntentRow[];
};

/** Group webhook intents by exchange + tradingsymbol; rows without both go to “Other / unmapped”. */
function groupWebhookIntentsByInstrument(
  rows: WebhookOrderIntentRow[],
): AlertIntentGroup[] {
  const map = new Map<string, WebhookOrderIntentRow[]>();
  for (const row of rows) {
    const ex = (row.exchange ?? "").trim();
    const sym = (row.tradingsymbol ?? "").trim();
    const key = ex && sym ? `${ex}\u0000${sym}` : ALERT_OTHER_GROUP_KEY;
    const cur = map.get(key);
    if (cur) cur.push(row);
    else map.set(key, [row]);
  }
  const groups: AlertIntentGroup[] = [];
  for (const [groupKey, list] of map) {
    const head = list[0];
    if (!head) continue;
    list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    if (groupKey === ALERT_OTHER_GROUP_KEY) {
      groups.push({
        groupKey,
        exchange: "",
        tradingsymbol: "",
        isOther: true,
        rows: list,
      });
    } else {
      groups.push({
        groupKey,
        exchange: (head.exchange ?? "").trim(),
        tradingsymbol: (head.tradingsymbol ?? "").trim(),
        isOther: false,
        rows: list,
      });
    }
  }
  groups.sort((a, b) => {
    if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
    const s = a.tradingsymbol.localeCompare(b.tradingsymbol);
    if (s !== 0) return s;
    return a.exchange.localeCompare(b.exchange);
  });
  return groups;
}

const TABS: { id: OrderflowTab; label: string }[] = [
  { id: "alerts", label: "Alerts" },
  { id: "open", label: "Open" },
  { id: "executed_closed", label: "Executed, closed orders" },
];

export default function OpenOrderHistoryView() {
  const [data, setData] = useState<OrderflowPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<OrderflowTab>("alerts");
  /** Instrument groups in Executed/closed tab: keys in the set are collapsed. */
  const [collapsedInstrumentKeys, setCollapsedInstrumentKeys] = useState<
    Set<string>
  >(() => new Set());

  const toggleInstrumentGroup = useCallback((instrumentKey: string) => {
    setCollapsedInstrumentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(instrumentKey)) next.delete(instrumentKey);
      else next.add(instrumentKey);
      return next;
    });
  }, []);

  const [collapsedAlertGroupKeys, setCollapsedAlertGroupKeys] = useState<
    Set<string>
  >(() => new Set());

  const toggleAlertGroup = useCallback((groupKey: string) => {
    setCollapsedAlertGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const [collapsedOpenGroupKeys, setCollapsedOpenGroupKeys] = useState<
    Set<string>
  >(() => new Set());

  const toggleOpenSnapshotGroup = useCallback((compositeKey: string) => {
    setCollapsedOpenGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(compositeKey)) next.delete(compositeKey);
      else next.add(compositeKey);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/kite/orderflow?snap_limit=40&events_limit=60");
      const j = (await r.json()) as OrderflowPayload & { error?: string };
      if (!r.ok) {
        setErr(j.error || r.statusText);
        setData(null);
        return;
      }
      setData({
        ...j,
        terminal_day_orders: j.terminal_day_orders ?? [],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const terminalGroups = useMemo(
    () =>
      groupTerminalOrdersByInstrument(data?.terminal_day_orders ?? []),
    [data?.terminal_day_orders],
  );

  const alertGroups = useMemo(
    () => groupWebhookIntentsByInstrument(data?.webhook_order_intents ?? []),
    [data?.webhook_order_intents],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
          Use tabs to switch between webhook{" "}
          <span className="font-medium text-zinc-300">alerts</span>, stored{" "}
          <span className="font-medium text-zinc-300">open</span> snapshots, and
          today&apos;s{" "}
          <span className="font-medium text-zinc-300">executed / closed</span>{" "}
          rows from Kite.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      <div
        className="flex flex-wrap gap-1 border-b border-zinc-800 pb-px"
        role="tablist"
        aria-label="Order flow sections"
      >
        {TABS.map(({ id, label }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`orderflow-tab-${id}`}
              aria-controls={`orderflow-panel-${id}`}
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "bg-zinc-900 text-zinc-100 ring-1 ring-b-0 ring-zinc-700"
                  : "text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {err ? (
        <p className="text-sm text-red-400">
          {err === "not_connected"
            ? "Connect Kite from the home dashboard (or set OPEN_ORDER_HISTORY_READ_SECRET and use Bearer token) to view history."
            : err}
        </p>
      ) : null}

      {!err && data && tab === "alerts" && data.webhook_order_intents.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No webhook events yet. POST to your TradingView webhook to record
          alerts.
        </p>
      ) : null}

      {!err && data && tab === "open" && data.snapshots.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No open snapshots yet. Trigger a webhook or refresh orders on the
          dashboard (identical consecutive books are not stored twice).
        </p>
      ) : null}

      {!err &&
      data &&
      tab === "executed_closed" &&
      data.terminal_day_orders.length === 0 &&
      !data.kite_day_orders_error ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No executed or closed orders in today&apos;s Kite day book, or connect
          Kite in the browser to load this tab (Bearer-only access does not
          include live Kite order fetch).
        </p>
      ) : null}

      {data && data.kite_day_orders_error && tab === "executed_closed" ? (
        <p className="text-sm text-amber-400">
          Could not load Kite day orders: {data.kite_day_orders_error}
        </p>
      ) : null}

      {data && tab === "alerts" && data.webhook_order_intents.length > 0 ? (
        <section
          id="orderflow-panel-alerts"
          role="tabpanel"
          aria-labelledby="orderflow-tab-alerts"
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg"
        >
          <header className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-300">
              Alerts — webhook intents ({data.webhook_order_intents.length} of{" "}
              {data.webhook_meta.total}, {alertGroups.length} groups)
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Derived from <code className="text-zinc-400">webhook_events</code> ·{" "}
              {data.webhook_meta.storage}
              {data.webhook_meta.database
                ? ` · ${data.webhook_meta.database}`
                : ""}
              . Grouped by exchange + symbol; click a header to expand or
              collapse.
            </p>
          </header>
          <div className="flex flex-col gap-4 p-4">
            {alertGroups.map((group, gi) => {
              const expanded = !collapsedAlertGroupKeys.has(group.groupKey);
              const panelId = `alerts-intent-panel-${gi}`;
              return (
                <div
                  key={group.groupKey}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-left hover:bg-zinc-800/70"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleAlertGroup(group.groupKey)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 text-zinc-500" aria-hidden>
                        {expanded ? "▾" : "▸"}
                      </span>
                      {group.isOther ? (
                        <span className="text-sm font-semibold text-zinc-300">
                          Other / unmapped
                        </span>
                      ) : (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-100">
                            {group.tradingsymbol}
                          </span>
                          <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            {group.exchange}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {group.rows.length} alert
                      {group.rows.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {expanded ? (
                    <div
                      id={panelId}
                      role="region"
                      aria-label={
                        group.isOther
                          ? "Unmapped webhook alerts"
                          : `${group.tradingsymbol} ${group.exchange} alerts`
                      }
                      className="overflow-x-auto"
                    >
                      <table className="w-full min-w-[780px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800/90 text-zinc-500">
                            <th className="px-4 py-2 font-medium">Received</th>
                            <th className="px-3 py-2 font-medium">Intent</th>
                            <th className="px-3 py-2 font-medium">Side</th>
                            <th className="px-3 py-2 font-medium">Product</th>
                            <th className="px-3 py-2 font-medium">Qty</th>
                            <th className="px-3 py-2 font-medium">Ord type</th>
                            <th className="px-3 py-2 font-medium">Price</th>
                            <th className="px-4 py-2 font-medium">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr
                              key={row.event_id}
                              className="border-b border-zinc-800/60 hover:bg-zinc-900/60"
                            >
                              <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">
                                {formatCaptured(row.receivedAt)}
                              </td>
                              <td className="px-3 py-2.5">
                                {intentBadge(row)}
                              </td>
                              <td className="px-3 py-2.5">
                                {row.transaction_type ? (
                                  <span
                                    className={
                                      row.transaction_type === "BUY"
                                        ? "inline-block rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white"
                                        : row.transaction_type === "SELL"
                                          ? "inline-block rounded bg-rose-700 px-2 py-0.5 text-[11px] font-medium text-white"
                                          : "text-zinc-400"
                                    }
                                  >
                                    {row.transaction_type}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-300">
                                {row.product ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-zinc-300">
                                {row.quantity != null ? row.quantity : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-400">
                                {row.order_type ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-zinc-300">
                                {intentPriceLabel(row)}
                              </td>
                              <td className="max-w-[240px] px-4 py-2.5 text-zinc-500">
                                <span className="font-mono text-[10px] text-zinc-600">
                                  {row.event_id.length > 8
                                    ? `${row.event_id.slice(0, 8)}… `
                                    : `${row.event_id} `}
                                </span>
                                {group.isOther &&
                                (row.tradingsymbol || row.exchange) ? (
                                  <span className="block text-[10px] text-zinc-600">
                                    {row.tradingsymbol || "—"}
                                    {row.exchange
                                      ? ` · ${row.exchange}`
                                      : ""}
                                  </span>
                                ) : null}
                                {row.map_ok
                                  ? row.tag
                                    ? `tag ${row.tag}`
                                    : "—"
                                  : row.map_message ?? row.map_reason ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {data && tab === "open" ? (
        <div
          id="orderflow-panel-open"
          role="tabpanel"
          aria-labelledby="orderflow-tab-open"
          className="flex flex-col gap-6"
        >
          {data.snapshots.map((snap) => {
            const openGroups = groupOpenSnapshotOrdersByInstrument(snap.orders);
            return (
              <section
                key={snap.id}
                className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                  <h2 className="text-sm font-medium text-zinc-300">
                    Open ({snap.orders.length}
                    {snap.orders.length > 0
                      ? `, ${openGroups.length} instrument${
                          openGroups.length === 1 ? "" : "s"
                        }`
                      : ""}
                    ) · {formatCaptured(snap.capturedAt)}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {snap.source}
                    {snap.webhook_event_id ? ` · ${snap.webhook_event_id}` : ""}
                    {snap.orders.length > 0
                      ? " · click group headers to expand or collapse"
                      : ""}
                  </p>
                </header>
                {snap.orders.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">
                    No open orders at capture time.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 p-4">
                    {openGroups.map((group, gi) => {
                      const composite = openGroupCompositeKey(
                        snap.id,
                        group.groupKey,
                      );
                      const expanded = !collapsedOpenGroupKeys.has(composite);
                      const panelId = `open-snap-${snap.id}-panel-${gi}`;
                      return (
                        <div
                          key={`${snap.id}-${group.groupKey}`}
                          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-left hover:bg-zinc-800/70"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            onClick={() =>
                              toggleOpenSnapshotGroup(composite)
                            }
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="shrink-0 text-zinc-500" aria-hidden>
                                {expanded ? "▾" : "▸"}
                              </span>
                              {group.isOther ? (
                                <span className="text-sm font-semibold text-zinc-300">
                                  Other / incomplete row
                                </span>
                              ) : (
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-zinc-100">
                                    {group.tradingsymbol}
                                  </span>
                                  <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                                    {group.exchange}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-zinc-500">
                              {group.orders.length} order
                              {group.orders.length === 1 ? "" : "s"}
                            </span>
                          </button>
                          {expanded ? (
                            <div
                              id={panelId}
                              role="region"
                              aria-label={
                                group.isOther
                                  ? `Open orders snapshot ${snap.id} other rows`
                                  : `${group.tradingsymbol} ${group.exchange} open orders`
                              }
                              className="overflow-x-auto"
                            >
                              <table className="w-full min-w-[640px] text-left text-xs">
                                <thead>
                                  <tr className="border-b border-zinc-800/90 text-zinc-500">
                                    <th className="px-4 py-2 font-medium">
                                      Time
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                      Type
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                      Product
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                      Qty
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                      LTP
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                      Price
                                    </th>
                                    <th className="px-4 py-2 font-medium">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.orders.map((row) => (
                                    <tr
                                      key={`${snap.id}-${row.order_id}`}
                                      className="border-b border-zinc-800/60 hover:bg-zinc-900/60"
                                    >
                                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-zinc-300">
                                        {formatClock(row.order_timestamp)}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span
                                          className={
                                            row.transaction_type === "BUY"
                                              ? "inline-block rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white"
                                              : row.transaction_type === "SELL"
                                                ? "inline-block rounded bg-rose-700 px-2 py-0.5 text-[11px] font-medium text-white"
                                                : "text-zinc-400"
                                          }
                                        >
                                          {row.transaction_type}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-zinc-300">
                                        {row.product}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-zinc-300">
                                        {row.filled_quantity} / {row.quantity}
                                      </td>
                                      <td className="px-3 py-2.5 font-mono text-zinc-500">
                                        —
                                      </td>
                                      <td className="px-3 py-2.5 font-mono text-zinc-300">
                                        {priceLabel(row)}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-300">
                                          {row.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {data &&
      tab === "executed_closed" &&
      data.terminal_day_orders.length > 0 ? (
        <section
          id="orderflow-panel-executed_closed"
          role="tabpanel"
          aria-labelledby="orderflow-tab-executed_closed"
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg"
        >
          <header className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-300">
              Executed, closed orders — today&apos;s Kite day book (
              {data.terminal_day_orders.length} orders, {terminalGroups.length}{" "}
              instruments)
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              COMPLETE, CANCELLED, REJECTED, CANCELLED AMO — grouped by
              exchange + symbol. Click a row header to show or hide orders.
            </p>
          </header>
          <div className="flex flex-col gap-4 p-4">
            {terminalGroups.map((group, gi) => {
              const expanded = !collapsedInstrumentKeys.has(
                group.instrumentKey,
              );
              const panelId = `executed-instrument-panel-${gi}`;
              return (
                <div
                  key={group.instrumentKey}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-left hover:bg-zinc-800/70"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleInstrumentGroup(group.instrumentKey)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="shrink-0 text-zinc-500"
                        aria-hidden
                      >
                        {expanded ? "▾" : "▸"}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          {group.tradingsymbol}
                        </span>
                        <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          {group.exchange}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {group.orders.length} order
                      {group.orders.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {expanded ? (
                    <div
                      id={panelId}
                      role="region"
                      aria-label={`${group.tradingsymbol} ${group.exchange} orders`}
                      className="overflow-x-auto"
                    >
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800/90 text-zinc-500">
                            <th className="px-4 py-2 font-medium">Time</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Product</th>
                            <th className="px-3 py-2 font-medium">Qty</th>
                            <th className="px-3 py-2 font-medium">Avg</th>
                            <th className="px-3 py-2 font-medium">Ord type</th>
                            <th className="px-3 py-2 font-medium">Price</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.orders.map((row) => (
                            <tr
                              key={row.order_id}
                              className="border-b border-zinc-800/60 hover:bg-zinc-900/60"
                            >
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-zinc-300">
                                {formatClock(row.order_timestamp)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={
                                    row.transaction_type === "BUY"
                                      ? "inline-block rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white"
                                      : row.transaction_type === "SELL"
                                        ? "inline-block rounded bg-rose-700 px-2 py-0.5 text-[11px] font-medium text-white"
                                        : "text-zinc-400"
                                  }
                                >
                                  {row.transaction_type}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-zinc-300">
                                {row.product}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-zinc-300">
                                {row.filled_quantity} / {row.quantity}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-zinc-300">
                                {avgLabel(row)}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-400">
                                {row.order_type}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-zinc-300">
                                {terminalPriceLabel(row)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-300">
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {data && tab === "open" && data.snapshot_meta.total > data.snapshots.length ? (
        <p className="text-xs text-zinc-500">
          Showing {data.snapshots.length} of {data.snapshot_meta.total}{" "}
          snapshots ({data.snapshot_meta.storage}
          {data.snapshot_meta.database
            ? ` · ${data.snapshot_meta.database}`
            : ""}
          ).
        </p>
      ) : null}

      {data &&
      tab === "alerts" &&
      data.webhook_meta.total > data.webhook_order_intents.length ? (
        <p className="text-xs text-zinc-500">
          Showing {data.webhook_order_intents.length} of{" "}
          {data.webhook_meta.total} webhook events (use{" "}
          <code className="text-zinc-400">events_limit</code> /{" "}
          <code className="text-zinc-400">events_offset</code> on{" "}
          <code className="text-zinc-400">/api/kite/orderflow</code> for more).
        </p>
      ) : null}
    </div>
  );
}
