"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderFlowLogRow } from "@/lib/order-flow-log";

type PagePayload = {
  rows: OrderFlowLogRow[];
  total: number;
  limit: number;
  offset: number;
  storage: string;
  database: string | null;
  collection: string;
  error?: string;
};

const STEP_COLORS: Record<string, string> = {
  webhook_received:
    "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  position_check:
    "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  exit_cancelled:
    "bg-purple-100 text-purple-900 dark:bg-purple-950/50 dark:text-purple-200",
  exit_order_placed:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  order_placed:
    "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  order_rejected:
    "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
  order_skipped:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function StepBadge({ step }: { step: string }) {
  const cls =
    STEP_COLORS[step] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {step}
    </span>
  );
}

export default function OrderFlowLogView() {
  const [data, setData] = useState<PagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(
    async (off: number) => {
      setBusy(true);
      setErr(null);
      const r = await fetch(
        `/api/kite/order-flow-log?limit=${limit}&offset=${off}`,
      );
      const j = (await r.json()) as PagePayload;
      if (!r.ok) {
        setData(null);
        setErr(
          j.error === "not_connected"
            ? "Connect Kite (or use read secret) to view logs."
            : (j.error ?? r.statusText),
        );
        setBusy(false);
        return;
      }
      setData(j);
      setBusy(false);
    },
    [],
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  const hasPrev = offset > 0;
  const hasNext = data ? offset + limit < data.total : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {data
            ? `${data.total} log entr${data.total === 1 ? "y" : "ies"}`
            : busy
              ? "Loading…"
              : "—"}
          {data?.storage ? ` · ${data.storage}` : ""}
          {data?.database ? ` · ${data.database}` : ""}
        </p>
        <button
          type="button"
          onClick={() => void load(offset)}
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
          No log entries recorded yet.
        </p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
            {data.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1 px-4 py-3 text-sm first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <time
                    className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
                    dateTime={row.at}
                    title={row.at}
                  >
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    }).format(new Date(row.at))}
                    {" IST"}
                  </time>
                  <StepBadge step={row.step} />
                  {row.tradingsymbol ? (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {row.tradingsymbol}
                    </span>
                  ) : null}
                  {row.transaction_type ? (
                    <span
                      className={
                        row.transaction_type === "BUY"
                          ? "text-xs font-semibold text-green-700 dark:text-green-400"
                          : "text-xs font-semibold text-red-700 dark:text-red-400"
                      }
                    >
                      {row.transaction_type}
                    </span>
                  ) : null}
                  {row.quantity != null ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      qty {row.quantity}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.exchange ? <span>{row.exchange}</span> : null}
                  {row.product ? <span>{row.product}</span> : null}
                  {row.order_type ? <span>{row.order_type}</span> : null}
                  {row.order_id ? <span>order {row.order_id}</span> : null}
                  <span className="font-mono">evt {row.webhook_event_id}</span>
                </div>

                {row.message ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    {row.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              {offset + 1}–{Math.min(offset + limit, data.total)} of{" "}
              {data.total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPrev || busy}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasNext || busy}
                onClick={() => setOffset((o) => o + limit)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
