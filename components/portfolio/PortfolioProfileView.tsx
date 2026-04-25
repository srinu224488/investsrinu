"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useKiteSession } from "@/components/dashboard/KiteSessionProvider";
import {
  buildPositionGroups,
  defaultPositionChipFilters,
  filterPositionRows,
  parsePositionRows,
  sumPositionTotals,
  type PositionChipFilters,
  type PositionGrouping,
  type PositionGroup,
} from "@/lib/portfolio-position-filters";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Plain 2dp amounts — no ₹ / grouping so live ticks do not reflow columns. */
function fmtAmt2(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4);
}

function pnlToneClass(n: number): string {
  if (n > 0.0005) return "text-emerald-700 dark:text-emerald-400";
  if (n < -0.0005) return "text-rose-700 dark:text-rose-400";
  return "text-zinc-600 dark:text-zinc-400";
}

function renderPositionTableBody(groups: PositionGroup[], kind: "net" | "day"): ReactNode {
  const flatCount = groups.reduce((acc, g) => acc + g.rows.length, 0);
  if (flatCount === 0) {
    return (
      <tr>
        <td colSpan={12} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
          No positions match filters.
        </td>
      </tr>
    );
  }
  return groups.map((g) => (
    <Fragment key={g.group ?? `${kind}-all`}>
      {g.group ? (
        <tr className="bg-zinc-100 dark:bg-zinc-800/90">
          <td
            colSpan={12}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
          >
            {g.group}
          </td>
        </tr>
      ) : null}
      {g.rows.map((r, i) => {
        const sym = String(r.tradingsymbol ?? "");
        const key = `${kind}-${g.group ?? "x"}-${sym}-${String(r.exchange ?? "")}-${i}`;
        const ur = num(r.unrealised);
        const rl = num(r.realised);
        const pnl = num(r.pnl);
        const ltp = num(r.last_price);
        const prevClose = num(r.close_price);
        const dayChgPct = prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : null;
        return (
          <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800">
            <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{sym}</td>
            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{String(r.exchange ?? "—")}</td>
            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{String(r.product ?? "—")}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtQty(num(r.quantity))}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{num(r.average_price).toFixed(2)}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              {prevClose > 0 ? prevClose.toFixed(2) : "—"}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{ltp.toFixed(2)}</td>
            <td className={`px-3 py-2 text-right font-mono tabular-nums ${dayChgPct != null ? pnlToneClass(dayChgPct) : "text-zinc-400"}`}>
              {dayChgPct != null ? `${dayChgPct >= 0 ? "+" : ""}${dayChgPct.toFixed(2)}%` : "—"}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtAmt2(num(r.value))}</td>
            <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(ur)}`}>{fmtAmt2(ur)}</td>
            <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(rl)}`}>{fmtAmt2(rl)}</td>
            <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(pnl)}`}>{fmtAmt2(pnl)}</td>
          </tr>
        );
      })}
    </Fragment>
  ));
}

function holdingQty(row: Record<string, unknown>): number {
  return num(row.quantity) + num(row.t1_quantity);
}

type PortfolioPayload = {
  holdings?: unknown[];
  positions?: { net?: unknown[]; day?: unknown[] };
  error?: string;
};

type StreamMsg =
  | { type: "connected"; interval_ms: number; kite_ws?: boolean; source?: string }
  | {
      type: "update";
      holdings: unknown[];
      positions: { net: unknown[]; day: unknown[] };
      at?: number;
    }
  | { type: "error"; message: string };

const STREAM_POLL_MS = 5000;

type PortfolioTab = "holdings" | "net" | "day";

function chipClass(on: boolean) {
  return [
    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
    on
      ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500",
  ].join(" ");
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "size-5 shrink-0"}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M10 18h4v-2h-4v2zM3 4h18v2H3V4zm2 5h14v2H5V9zm2 5h10v2H7v-2z" />
    </svg>
  );
}

export default function PortfolioProfileView() {
  const { profile } = useKiteSession();
  const filterFieldId = useId();
  const [tab, setTab] = useState<PortfolioTab>("net");
  const [posGrouping, setPosGrouping] = useState<PositionGrouping>("none");
  const [posChips, setPosChips] = useState<PositionChipFilters>(() => defaultPositionChipFilters());
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const filterPopoverRootRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PortfolioPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [streamLive, setStreamLive] = useState(false);
  const [streamEveryMs, setStreamEveryMs] = useState<number | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const intentionalEsClose = useRef(false);

  const sessionPending = profile === null;
  const sessionConnected = profile !== null && profile.connected;

  const load = useCallback(async () => {
    if (!sessionConnected) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/kite/portfolio", { cache: "no-store" });
      const j = (await r.json()) as PortfolioPayload & { error?: string };
      if (!r.ok) {
        setData(null);
        setErr(
          j.error === "not_connected"
            ? "Connect (Kite) to load holdings and positions."
            : j.error || r.statusText,
        );
        return;
      }
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch_failed");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [sessionConnected]);

  useEffect(() => {
    if (sessionPending) {
      setBusy(true);
      return;
    }
    if (!sessionConnected) {
      intentionalEsClose.current = true;
      setBusy(false);
      setStreamLive(false);
      setStreamEveryMs(null);
      setLastAt(null);
      setData(null);
      setErr(null);
      return;
    }

    intentionalEsClose.current = false;
    setBusy(true);
    setErr(null);
    setStreamLive(false);

    const es = new EventSource(
      `/api/kite/portfolio/stream?interval_ms=${STREAM_POLL_MS}`,
    );

    es.onmessage = (ev) => {
      let msg: StreamMsg;
      try {
        msg = JSON.parse(ev.data) as StreamMsg;
      } catch {
        return;
      }
      if (msg.type === "connected") {
        setStreamEveryMs(msg.interval_ms);
        setStreamLive(true);
        return;
      }
      if (msg.type === "update") {
        setData({
          holdings: msg.holdings,
          positions: msg.positions,
        });
        setBusy(false);
        setLastAt(msg.at ?? Date.now());
        return;
      }
      if (msg.type === "error") {
        setStreamLive(false);
        setData(null);
        setErr(
          msg.message === "not_connected"
            ? "Session ended — connect Kite again. Live stream has stopped."
            : msg.message,
        );
        intentionalEsClose.current = true;
        es.close();
        setBusy(false);
      }
    };

    es.onerror = () => {
      if (intentionalEsClose.current) {
        intentionalEsClose.current = false;
        return;
      }
      setStreamLive(false);
      setErr((prev) => prev ?? "Live stream disconnected.");
      es.close();
      setBusy(false);
    };

    return () => {
      intentionalEsClose.current = true;
      es.close();
    };
  }, [sessionPending, sessionConnected, streamRetryKey]);

  const holdingsRows = useMemo(() => {
    const raw = data?.holdings;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
      .filter((r): r is Record<string, unknown> => Boolean(r))
      .filter((r) => holdingQty(r) > 0);
  }, [data?.holdings]);

  const netRowsAll = useMemo(() => parsePositionRows(data?.positions?.net), [data?.positions?.net]);
  const dayRowsAll = useMemo(() => parsePositionRows(data?.positions?.day), [data?.positions?.day]);

  const netRows = useMemo(() => filterPositionRows(netRowsAll, posChips), [netRowsAll, posChips]);
  const dayRows = useMemo(() => filterPositionRows(dayRowsAll, posChips), [dayRowsAll, posChips]);

  const netGroups = useMemo(
    () => buildPositionGroups(netRows, posGrouping),
    [netRows, posGrouping],
  );
  const dayGroups = useMemo(
    () => buildPositionGroups(dayRows, posGrouping),
    [dayRows, posGrouping],
  );

  const holdingsTotals = useMemo(() => {
    let totalPnl = 0;
    let dayPnl = 0;
    let invested = 0;
    let current = 0;
    for (const r of holdingsRows) {
      totalPnl += num(r.pnl);
      dayPnl += num(r.day_change);
      const q = holdingQty(r);
      invested += num(r.average_price) * q;
      current += num(r.last_price) * q;
    }
    return { totalPnl, dayPnl, invested, current };
  }, [holdingsRows]);

  const netTotals = useMemo(() => sumPositionTotals(netRows), [netRows]);
  const dayTotals = useMemo(() => sumPositionTotals(dayRows), [dayRows]);

  const clearPositionFilters = useCallback(() => {
    setPosGrouping("none");
    setPosChips(defaultPositionChipFilters());
    setFilterPopoverOpen(false);
  }, []);

  const positionFiltersActive = useMemo(
    () =>
      posGrouping !== "none" ||
      posChips.nrml ||
      posChips.eq ||
      posChips.long ||
      posChips.overnight ||
      posChips.short ||
      posChips.mcx ||
      posChips.nfo ||
      posChips.nse ||
      posChips.open ||
      posChips.closed,
    [posGrouping, posChips],
  );

  useEffect(() => {
    if (tab !== "net" && tab !== "day") setFilterPopoverOpen(false);
  }, [tab]);

  useEffect(() => {
    if (!filterPopoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterPopoverOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterPopoverOpen]);

  useEffect(() => {
    if (!filterPopoverOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = filterPopoverRootRef.current;
      if (root && !root.contains(e.target as Node)) setFilterPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterPopoverOpen]);

  if (sessionPending) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">
        Checking Kite session…
      </p>
    );
  }

  if (!sessionConnected) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Portfolio stream is off</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Connect (Kite) on this site to load holdings and positions. No live connection is opened while you
          are logged out.
        </p>
        <a
          href="/api/kite/login"
          className="mt-3 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Connect
        </a>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
        <p>{err}</p>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setStreamRetryKey((k) => k + 1);
          }}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-100 dark:hover:bg-zinc-800"
        >
          Retry stream
        </button>
      </div>
    );
  }

  if (busy && !data && !err) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">
        Loading portfolio…
      </p>
    );
  }

  const updatedLabel =
    lastAt != null
      ? new Intl.DateTimeFormat(undefined, {
          timeStyle: "medium",
          dateStyle: "short",
        }).format(lastAt)
      : null;

  const tabBtnClass = (id: PortfolioTab) =>
    [
      "rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors",
      tab === id
        ? "border-b-2 border-emerald-600 text-zinc-900 dark:border-emerald-500 dark:text-zinc-100"
        : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
    ].join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {streamLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-100">
                <span
                  className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                  aria-hidden
                />
                Live stream active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                Live stream off
              </span>
            )}
            {streamEveryMs != null ? (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Kite WebSocket (LTP) + REST · SSE · poll every {Math.round(streamEveryMs / 1000)}s
              </span>
            ) : null}
            {updatedLabel ? (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Last update {updatedLabel}</span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Book structure and baseline P&amp;L come from Kite REST{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">/portfolio/holdings</code> and{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">/portfolio/positions</code>; live
            last prices merge from the{" "}
            <a
              className="underline decoration-zinc-400/70 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
              href="https://kite.trade/docs/connect/v3/websocket/"
              rel="noreferrer"
              target="_blank"
            >
              Kite ticker WebSocket
            </a>
            . Order postbacks on that socket trigger a REST refresh. The stream stops when you leave this page, log
            out, or the session ends.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {busy ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap gap-1" role="tablist" aria-label="Portfolio views">
          <button
            id="tab-portfolio-holdings"
            type="button"
            role="tab"
            aria-selected={tab === "holdings"}
            aria-controls="panel-portfolio-holdings"
            className={tabBtnClass("holdings")}
            onClick={() => setTab("holdings")}
          >
            Holdings
          </button>
          <button
            id="tab-portfolio-net"
            type="button"
            role="tab"
            aria-selected={tab === "net"}
            aria-controls="panel-portfolio-net"
            className={tabBtnClass("net")}
            onClick={() => setTab("net")}
          >
            Positions (net)
          </button>
          <button
            id="tab-portfolio-day"
            type="button"
            role="tab"
            aria-selected={tab === "day"}
            aria-controls="panel-portfolio-day"
            className={tabBtnClass("day")}
            onClick={() => setTab("day")}
          >
            Positions (day)
          </button>
        </div>
        {(tab === "net" || tab === "day") && (
          <div ref={filterPopoverRootRef} className="relative shrink-0 pb-0.5">
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-expanded={filterPopoverOpen}
              aria-haspopup="dialog"
              aria-controls={`${filterFieldId}-position-filters-popover`}
              aria-label="Position filters"
              onClick={() => setFilterPopoverOpen((o) => !o)}
            >
              <FilterIcon className="size-5" />
              {positionFiltersActive ? (
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" aria-hidden />
              ) : null}
            </button>
            {filterPopoverOpen ? (
              <div
                id={`${filterFieldId}-position-filters-popover`}
                className="absolute right-0 top-full z-50 mt-1.5 w-[min(100vw-1.5rem,20rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/40"
                role="dialog"
                aria-label="Position filters"
              >
                <div className="border-b border-zinc-200 pb-3 dark:border-zinc-700">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Grouping
                  </p>
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        { id: "none" as const, label: "None" },
                        { id: "underlying" as const, label: "Underlying" },
                        { id: "underlying_expiry" as const, label: "Underlying & Expiry" },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                      >
                        <input
                          type="radio"
                          className="size-4 accent-emerald-600"
                          name={`${filterFieldId}-pos-grouping`}
                          checked={posGrouping === opt.id}
                          onChange={() => setPosGrouping(opt.id)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Filter
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={posChips.nrml}
                      className={chipClass(posChips.nrml)}
                      onClick={() => setPosChips((c) => ({ ...c, nrml: !c.nrml }))}
                    >
                      NRML
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.eq}
                      className={chipClass(posChips.eq)}
                      onClick={() => setPosChips((c) => ({ ...c, eq: !c.eq }))}
                    >
                      EQ
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.long}
                      className={chipClass(posChips.long)}
                      onClick={() => setPosChips((c) => ({ ...c, long: !c.long }))}
                    >
                      LONG
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.overnight}
                      className={chipClass(posChips.overnight)}
                      onClick={() => setPosChips((c) => ({ ...c, overnight: !c.overnight }))}
                    >
                      OVERNIGHT
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.short}
                      className={chipClass(posChips.short)}
                      onClick={() => setPosChips((c) => ({ ...c, short: !c.short }))}
                    >
                      SHORT
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.mcx}
                      className={chipClass(posChips.mcx)}
                      onClick={() => setPosChips((c) => ({ ...c, mcx: !c.mcx }))}
                    >
                      MCX
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.nfo}
                      className={chipClass(posChips.nfo)}
                      onClick={() => setPosChips((c) => ({ ...c, nfo: !c.nfo }))}
                    >
                      NFO
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.nse}
                      className={chipClass(posChips.nse)}
                      onClick={() => setPosChips((c) => ({ ...c, nse: !c.nse }))}
                    >
                      NSE
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.open}
                      className={chipClass(posChips.open)}
                      onClick={() => setPosChips((c) => ({ ...c, open: !c.open }))}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-pressed={posChips.closed}
                      className={chipClass(posChips.closed)}
                      onClick={() => setPosChips((c) => ({ ...c, closed: !c.closed }))}
                    >
                      Closed
                    </button>
                  </div>
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={clearPositionFilters}
                      className="text-xs font-semibold uppercase tracking-wide text-zinc-500 underline decoration-zinc-400/80 underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {tab === "holdings" ? (
      <section
        id="panel-portfolio-holdings"
        className="flex flex-col gap-4"
        role="tabpanel"
        aria-labelledby="tab-portfolio-holdings"
      >
        <div className="flex flex-col gap-1 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold tracking-tight">Holdings</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Total P&amp;L</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(holdingsTotals.totalPnl)}`}>
                {fmtAmt2(holdingsTotals.totalPnl)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Day change</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(holdingsTotals.dayPnl)}`}>
                {fmtAmt2(holdingsTotals.dayPnl)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Invested (avg × qty)</span>
              <p className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{fmtAmt2(holdingsTotals.invested)}</p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Current (LTP × qty)</span>
              <p className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{fmtAmt2(holdingsTotals.current)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Exch</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Avg (₹)</th>
                <th className="px-3 py-2 text-right font-medium">LTP (₹)</th>
                <th className="px-3 py-2 text-right font-medium">Total P&amp;L</th>
                <th className="px-3 py-2 text-right font-medium">Day P&amp;L</th>
                <th className="px-3 py-2 text-right font-medium">Day %</th>
              </tr>
            </thead>
            <tbody>
              {holdingsRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    No demat holdings with quantity.
                  </td>
                </tr>
              ) : (
                holdingsRows.map((r, i) => {
                  const sym = String(r.tradingsymbol ?? "");
                  const key = `${sym}-${String(r.exchange ?? "")}-${i}`;
                  const q = holdingQty(r);
                  const totalPnl = num(r.pnl);
                  const dayCh = num(r.day_change);
                  const dayPct = num(r.day_change_percentage);
                  return (
                    <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{sym}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{String(r.exchange ?? "—")}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{String(r.product ?? "—")}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtQty(q)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{num(r.average_price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{num(r.last_price).toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(totalPnl)}`}>
                        {fmtAmt2(totalPnl)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(dayCh)}`}>
                        {fmtAmt2(dayCh)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(dayPct)}`}>
                        {Number.isFinite(dayPct) ? `${dayPct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : tab === "net" ? (
      <section
        id="panel-portfolio-net"
        className="flex flex-col gap-4"
        role="tabpanel"
        aria-labelledby="tab-portfolio-net"
      >
        <div className="flex flex-col gap-1 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold tracking-tight">Positions (net)</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Carry-forward and combined intraday + overnight exposure. Unrealised is MTM; realised is closed leg P&amp;L
            (per Kite).
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Unrealised</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(netTotals.unrealised)}`}>
                {fmtAmt2(netTotals.unrealised)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Realised</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(netTotals.realised)}`}>
                {fmtAmt2(netTotals.realised)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Total P&amp;L</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(netTotals.pnl)}`}>
                {fmtAmt2(netTotals.pnl)}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1020px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Exch</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Avg (₹)</th>
                <th className="px-3 py-2 text-right font-medium">Prev Close</th>
                <th className="px-3 py-2 text-right font-medium">LTP (₹)</th>
                <th className="px-3 py-2 text-right font-medium">Day Chg%</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">Unrealised</th>
                <th className="px-3 py-2 text-right font-medium">Realised</th>
                <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>{renderPositionTableBody(netGroups, "net")}</tbody>
          </table>
        </div>
      </section>
      ) : (
      <section
        id="panel-portfolio-day"
        className="flex flex-col gap-4"
        role="tabpanel"
        aria-labelledby="tab-portfolio-day"
      >
        <div className="flex flex-col gap-1 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold tracking-tight">Positions (day)</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Today’s intraday book only (per Kite).</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Unrealised</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(dayTotals.unrealised)}`}>
                {fmtAmt2(dayTotals.unrealised)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Realised</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(dayTotals.realised)}`}>
                {fmtAmt2(dayTotals.realised)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Total P&amp;L</span>
              <p className={`font-mono font-semibold tabular-nums ${pnlToneClass(dayTotals.pnl)}`}>
                {fmtAmt2(dayTotals.pnl)}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1020px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Exch</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Avg (₹)</th>
                <th className="px-3 py-2 text-right font-medium">Prev Close</th>
                <th className="px-3 py-2 text-right font-medium">LTP (₹)</th>
                <th className="px-3 py-2 text-right font-medium">Day Chg%</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">Unrealised</th>
                <th className="px-3 py-2 text-right font-medium">Realised</th>
                <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>{renderPositionTableBody(dayGroups, "day")}</tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}
