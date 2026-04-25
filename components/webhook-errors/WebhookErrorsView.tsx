"use client";

import { useCallback, useEffect, useState } from "react";

const istFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatIST(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : istFmt.format(d);
}

type ErrorRow = {
  id: string;
  loggedAt: string;
  source: string;
  message: string;
  error_type?: string;
  webhook_event_id?: string;
  detail?: Record<string, unknown>;
};

type PagePayload = {
  errors: ErrorRow[];
  total: number;
  limit: number;
  offset: number;
  storage: string;
  database: string | null;
  error?: string;
};

export default function WebhookErrorsView() {
  const [data, setData] = useState<PagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/kite/webhook-error-log?limit=100&offset=0");
    const j = (await r.json()) as PagePayload & { error?: string };
    if (!r.ok) {
      setData(null);
      setErr(j.error === "not_connected" ? "Connect Kite (or use read secret) to view errors." : (j.error || r.statusText));
      setBusy(false);
      return;
    }
    setData(j);
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {data
            ? `${data.total} logged error${data.total === 1 ? "" : "s"}`
            : busy
              ? "Loading…"
              : "—"}
          {data?.storage ? ` · ${data.storage}` : ""}
          {data?.database ? ` · ${data.database}` : ""}
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

      {!err && data && data.errors.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No webhook errors recorded yet.
        </p>
      ) : null}

      {data && data.errors.length > 0 ? (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {data.errors.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-1 px-4 py-3 text-sm first:rounded-t-lg last:rounded-b-lg"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <time
                  className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
                  dateTime={row.loggedAt}
                >
                  {formatIST(row.loggedAt)}
                </time>
                {row.error_type ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    {row.error_type}
                  </span>
                ) : null}
              </div>
              <p className="text-zinc-900 dark:text-zinc-100">{row.message}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {row.source}
                {row.webhook_event_id ? ` · event ${row.webhook_event_id}` : ""}
              </p>
              {row.detail && Object.keys(row.detail).length > 0 ? (
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-100 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  {JSON.stringify(row.detail, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
