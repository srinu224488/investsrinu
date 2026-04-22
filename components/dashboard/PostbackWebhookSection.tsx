import { isTradingViewWebhookEventBodyForTable } from "@/lib/tradingview-kite-order";
import { webhookBodyToTableRow } from "@/lib/tradingview-webhook-table-row";

import type { WebhookRow } from "./types";

type Props = {
  events: WebhookRow[];
  /** ISO time of the last successful events fetch. */
  eventsUpdatedAt: string | null;
  eventsErr: string | null;
  onRefreshEvents: () => void | Promise<void>;
};

/** Explicit locale + zone so SSR (Node) and the browser produce the same string. */
const eventTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return eventTimeFmt.format(d);
}

function ActionBadge({ raw }: { raw: string }) {
  const a = raw.trim().toLowerCase();
  const isBuy = a === "buy" || a === "long";
  const isSell = a === "sell" || a === "short";
  const label = raw.trim() ? raw.toUpperCase() : "—";
  const cls = isBuy
    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100"
    : isSell
      ? "bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-100"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex min-w-[3rem] justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

export function PostbackWebhookSection({
  events,
  eventsUpdatedAt,
  eventsErr,
  onRefreshEvents,
}: Props) {
  const tableEvents = events.filter((ev) =>
    isTradingViewWebhookEventBodyForTable(ev.body),
  );

  return (
    <section
      id="webhooks"
      className="scroll-mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Webhook events
        </h2>
        <button
          type="button"
          onClick={() => void onRefreshEvents()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-teal-600/25 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 shadow-sm transition hover:bg-teal-100 active:scale-[0.99] dark:border-teal-500/30 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-950/80"
        >
          <svg
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh events
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Last updated:{" "}
        {eventsUpdatedAt ? (
          <time
            dateTime={eventsUpdatedAt}
            className="font-mono text-zinc-600 dark:text-zinc-300"
          >
            {formatEventTime(eventsUpdatedAt)}
          </time>
        ) : (
          <span className="font-mono text-zinc-600 dark:text-zinc-300">—</span>
        )}
      </p>
      {eventsErr ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {eventsErr}
        </p>
      ) : null}
      <div className="mt-4 max-h-96 overflow-auto">
        {tableEvents.length === 0 && !eventsErr ? (
          <p className="text-sm text-zinc-500">No webhook payloads yet.</p>
        ) : tableEvents.length === 0 ? null : (
          <table className="w-full min-w-[340px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="sticky top-0 bg-white py-2 pr-2 font-medium dark:bg-zinc-950">
                  Time
                </th>
                <th className="sticky top-0 bg-white py-2 pr-2 font-medium dark:bg-zinc-950">
                  Ticker
                </th>
                <th className="sticky top-0 bg-white py-2 pr-2 font-medium dark:bg-zinc-950">
                  Price
                </th>
                <th className="sticky top-0 bg-white py-2 font-medium dark:bg-zinc-950">
                  Action · interval
                </th>
              </tr>
            </thead>
            <tbody>
              {tableEvents.map((ev) => {
                const row = webhookBodyToTableRow(ev.body);
                if (!row) return null;
                const interval =
                  row.interval && row.interval !== "—" ? row.interval : null;
                return (
                  <tr
                    key={ev.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td
                      className="whitespace-nowrap py-2 pr-2 font-mono text-[10px] text-zinc-500"
                      title={ev.receivedAt}
                    >
                      {formatEventTime(ev.receivedAt)}
                    </td>
                    <td className="py-2 pr-2 font-medium">{row.ticker}</td>
                    <td className="py-2 pr-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {row.price === "—" ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        row.price
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionBadge
                          raw={row.action === "—" ? "" : row.action}
                        />
                        {interval ? (
                          <span className="font-mono text-[10px] text-zinc-500">
                            {interval}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
