"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  createdAt: string;
  webhook_event_id: string;
  outcome: string;
  order_id?: string;
  message?: string;
  error_type?: string;
  exchange?: string;
  tradingsymbol?: string;
  product?: string;
  transaction_type?: string;
  quantity?: number;
  kite_live_status?: string;
  kite_filled_quantity?: number;
  kite_pending_quantity?: number;
};

type Payload = {
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
  storage: string;
  database: string | null;
  kite_live_enriched?: boolean;
  error?: string;
};

function placedLabel(outcome: string): string {
  if (outcome === "placed") return "Yes";
  return "No";
}

function outcomeDescription(outcome: string): string {
  const m: Record<string, string> = {
    placed: "Broker accepted order",
    not_placed_invalid_payload: "Alert JSON did not map to an order",
    not_placed_no_token: "No server Kite token",
    not_placed_not_executable: "Pre-check failed (invalid fields or unknown symbol)",
    not_placed_orders_fetch_failed: "Could not load orders from Kite",
    not_placed_duplicate: "Skipped — same-side order already open",
    not_placed_kite_reject: "Kite rejected place request",
  };
  return m[outcome] ?? outcome;
}

function statusCell(r: Row): string {
  if (r.kite_live_status) return r.kite_live_status;
  if (r.outcome === "placed") {
    return r.order_id ? "Placed (refresh when logged in for live)" : "Placed";
  }
  if (r.error_type) return r.error_type;
  if (r.message) {
    const short = r.message.length > 48 ? `${r.message.slice(0, 48)}…` : r.message;
    return short;
  }
  return "—";
}

export default function AutomatedOrdersView() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/kite/automated-orders?limit=100&offset=0");
    const j = (await r.json()) as Payload & { error?: string };
    if (!r.ok) {
      setData(null);
      setErr(
        j.error === "not_connected"
          ? "Connect Kite on this site to view automated orders (or use read secret)."
          : j.error || r.statusText,
      );
      setBusy(false);
      return;
    }
    setData(j);
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = useMemo(() => {
    if (!data) return "";
    const parts = [`${data.total} row${data.total === 1 ? "" : "s"}`, data.storage];
    if (data.database) parts.push(data.database);
    if (data.kite_live_enriched === false && data.rows.some((x) => x.outcome === "placed")) {
      parts.push("log in for live status");
    }
    return parts.join(" · ");
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {busy ? "Loading…" : meta || "—"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {err ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      {!err && data && data.rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No TradingView webhook placement attempts yet. Alerts to your live webhook
          URL will appear here.
        </p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Placed</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Order ID</th>
                <th className="px-3 py-2 font-medium">Event</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const sym =
                  r.exchange && r.tradingsymbol
                    ? `${r.exchange}:${r.tradingsymbol}`
                    : r.tradingsymbol || "—";
                const fillHint =
                  r.kite_filled_quantity != null && r.kite_pending_quantity != null
                    ? ` (${r.kite_filled_quantity}/${r.kite_filled_quantity + r.kite_pending_quantity})`
                    : "";
                return (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {r.createdAt}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.outcome === "placed"
                            ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-300/20 dark:text-zinc-300"
                        }
                      >
                        {placedLabel(r.outcome)}
                      </span>
                    </td>
                    <td
                      className="max-w-[220px] px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300"
                      title={outcomeDescription(r.outcome)}
                    >
                      {statusCell(r)}
                      {fillHint}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{sym}</td>
                    <td className="px-3 py-2">{r.transaction_type || "—"}</td>
                    <td className="px-3 py-2">{r.quantity ?? "—"}</td>
                    <td className="px-3 py-2">{r.product || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.order_id || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                      {r.webhook_event_id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
