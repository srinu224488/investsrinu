"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postKitePlaceOrder } from "@/components/dashboard/kite-fetch";

type MaCrossBarState = {
  index: number;
  close: number;
  sma: number | null;
  aboveCount: number;
  belowCount: number;
  longEntry: boolean;
  shortEntry: boolean;
};

type MaCrossLatest = {
  last: MaCrossBarState | null;
  longEntry: boolean;
  shortEntry: boolean;
};

type KiteBarLite = {
  time: string;
  close: number;
};

type ApiOk = {
  symbol: string;
  instrument_token: number;
  interval: string;
  from: string;
  to: string;
  range_clamped?: boolean;
  strategy: { length: number; confirmBars: number };
  bars?: KiteBarLite[];
  series: MaCrossBarState[];
  latest: MaCrossLatest;
};

type SignalRecord = {
  key: string;
  source: "backtest" | "live";
  time: string;
  side: "long" | "short";
  close: number;
  sma: number | null;
};

type SseReady = {
  type: "ready";
  symbol: string;
  instrument_token: number;
  interval: string;
  from: string;
  to: string;
  range_clamped?: boolean;
  strategy: { length: number; confirmBars: number };
  bars: number;
  latest: MaCrossLatest;
};

type SseTick = {
  type: "tick";
  ltp: number;
  latest: MaCrossLatest;
  at: number;
};

type SseErr = { type: "error"; message: string };
type SseClosed = { type: "closed" };
type LiveSse = SseReady | SseTick | SseErr | SseClosed;

const INTERVAL_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "60minute", label: "60m" },
  { value: "30minute", label: "30m" },
  { value: "15minute", label: "15m" },
  { value: "10minute", label: "10m" },
  { value: "5minute", label: "5m" },
  { value: "3minute", label: "3m" },
  { value: "minute", label: "1m" },
] as const;

/** Min ms between duplicate live long/short log rows (matches chart bar size; avoids tick noise). */
function liveSignalCooldownMs(interval: string): number {
  const m: Record<string, number> = {
    minute: 60_000,
    "3minute": 180_000,
    "5minute": 300_000,
    "10minute": 600_000,
    "15minute": 900_000,
    "30minute": 1_800_000,
    "60minute": 3_600_000,
    day: 86_400_000,
  };
  return m[interval] ?? 60_000;
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day} 00:00:00`;
  };
  const toStr = () => {
    const y = to.getFullYear();
    const m = String(to.getMonth() + 1).padStart(2, "0");
    const day = String(to.getDate()).padStart(2, "0");
    return `${y}-${m}-${day} 23:59:59`;
  };
  return { from: fmt(from), to: toStr() };
}

export default function MaCrossStrategyView() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [symbol, setSymbol] = useState("MCX:CRUDEOILM26APRFUT");
  const [interval, setInterval] = useState<string>("day");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [length, setLength] = useState(9);
  const [confirmBars, setConfirmBars] = useState(1);
  const [result, setResult] = useState<ApiOk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [execQty, setExecQty] = useState(1);
  const [execProduct, setExecProduct] = useState("MIS");
  const [execLoading, setExecLoading] = useState(false);
  const [execOrderResult, setExecOrderResult] = useState<{
    txType: string;
    ok: boolean;
    orderId?: string;
    error?: string;
  } | null>(null);
  const [execOrderErr, setExecOrderErr] = useState<string | null>(null);

  const liveAbortRef = useRef<AbortController | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveReady, setLiveReady] = useState<SseReady | null>(null);
  const [liveTick, setLiveTick] = useState<{
    ltp: number;
    latest: MaCrossLatest;
    at: number;
  } | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [liveSignalRows, setLiveSignalRows] = useState<SignalRecord[]>([]);
  const liveSigEdgeRef = useRef({ long: false, short: false });
  const liveSignalKeyRef = useRef(0);
  const lastLiveLongLogAt = useRef(0);
  const lastLiveShortLogAt = useRef(0);

  const stopLive = useCallback(() => {
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    setLiveActive(false);
    setLiveReady(null);
    setLiveTick(null);
    setLiveSignalRows([]);
    liveSigEdgeRef.current = { long: false, short: false };
    liveSignalKeyRef.current = 0;
    lastLiveLongLogAt.current = 0;
    lastLiveShortLogAt.current = 0;
  }, []);

  const startLive = useCallback(() => {
    stopLive();
    setLiveErr(null);
    const q = new URLSearchParams({
      symbol: symbol.trim(),
      interval,
      length: String(length),
      confirm_bars: String(confirmBars),
    });
    if (from.trim() && to.trim()) {
      q.set("from", from.trim());
      q.set("to", to.trim());
    }
    const url = `/api/kite/ma-cross/stream?${q.toString()}`;
    const ac = new AbortController();
    liveAbortRef.current = ac;
    setLiveActive(true);

    void (async () => {
      try {
        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setLiveErr(j.error ?? `HTTP ${res.status}`);
          setLiveActive(false);
          if (liveAbortRef.current === ac) liveAbortRef.current = null;
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setLiveErr("no_response_body");
          setLiveActive(false);
          if (liveAbortRef.current === ac) liveAbortRef.current = null;
          return;
        }
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          for (;;) {
            const sep = buf.indexOf("\n\n");
            if (sep < 0) break;
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6);
              try {
                const j = JSON.parse(raw) as LiveSse;
                if (j.type === "ready") {
                  setLiveReady(j);
                } else if (j.type === "tick") {
                  setLiveTick({ ltp: j.ltp, latest: j.latest, at: j.at });
                } else if (j.type === "error") {
                  setLiveErr(j.message);
                  stopLive();
                } else if (j.type === "closed") {
                  stopLive();
                }
              } catch {
                setLiveErr("invalid_event");
                stopLive();
              }
            }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof Error && e.name === "AbortError") return;
        setLiveErr(e instanceof Error ? e.message : "live_stream_failed");
        stopLive();
      } finally {
        if (!ac.signal.aborted) {
          setLiveActive(false);
        }
        if (liveAbortRef.current === ac) {
          liveAbortRef.current = null;
        }
      }
    })();
  }, [
    symbol,
    interval,
    length,
    confirmBars,
    from,
    to,
    stopLive,
  ]);

  useEffect(() => {
    return () => {
      liveAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!liveReady) return;
    const latest = liveTick?.latest ?? liveReady.latest;
    const prev = liveSigEdgeRef.current;
    const long = latest.longEntry;
    const short = latest.shortEntry;
    if (!liveTick) {
      liveSigEdgeRef.current = { long, short };
      return;
    }
    const price = liveTick.ltp;
    const sma = latest.last?.sma ?? null;
    const timeStr = new Date(liveTick.at).toLocaleString("sv-SE");
    const next: SignalRecord[] = [];
    const cool = liveSignalCooldownMs(interval);
    const t = liveTick.at;
    if (long && !prev.long) {
      if (t - lastLiveLongLogAt.current >= cool) {
        lastLiveLongLogAt.current = t;
        liveSignalKeyRef.current += 1;
        next.push({
          key: `live-${liveSignalKeyRef.current}-long`,
          source: "live",
          time: timeStr,
          side: "long",
          close: price,
          sma,
        });
      }
    }
    if (short && !prev.short) {
      if (t - lastLiveShortLogAt.current >= cool) {
        lastLiveShortLogAt.current = t;
        liveSignalKeyRef.current += 1;
        next.push({
          key: `live-${liveSignalKeyRef.current}-short`,
          source: "live",
          time: timeStr,
          side: "short",
          close: price,
          sma,
        });
      }
    }
    if (next.length) {
      setLiveSignalRows((r) => [...r, ...next]);
    }
    liveSigEdgeRef.current = { long, short };
  }, [liveTick, liveReady, interval]);

  const backtestSignalRows = useMemo((): SignalRecord[] => {
    if (!result?.bars?.length || !result.series?.length) return [];
    const out: SignalRecord[] = [];
    const n = Math.min(result.bars.length, result.series.length);
    for (let i = 0; i < n; i++) {
      const s = result.series[i]!;
      const b = result.bars[i]!;
      if (s.longEntry) {
        out.push({
          key: `bt-${b.time}-long`,
          source: "backtest",
          time: b.time,
          side: "long",
          close: s.close,
          sma: s.sma,
        });
      }
      if (s.shortEntry) {
        out.push({
          key: `bt-${b.time}-short`,
          source: "backtest",
          time: b.time,
          side: "short",
          close: s.close,
          sma: s.sma,
        });
      }
    }
    return out;
  }, [result]);

  const allSignalRows = useMemo(
    () => [...backtestSignalRows, ...liveSignalRows],
    [backtestSignalRows, liveSignalRows],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setResult(null);
    const q = new URLSearchParams({
      symbol: symbol.trim(),
      interval,
      from: from.trim(),
      to: to.trim(),
      length: String(length),
      confirm_bars: String(confirmBars),
    });
    try {
      const r = await fetch(`/api/kite/ma-cross?${q.toString()}`);
      const j = (await r.json()) as { error?: string } & Partial<ApiOk>;
      if (!r.ok) {
        setErr(j.error || r.statusText);
        return;
      }
      setResult(j as ApiOk);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  async function onExecute(e: FormEvent) {
    e.preventDefault();
    setExecLoading(true);
    setExecOrderErr(null);
    setExecOrderResult(null);
    setErr(null);

    const q = new URLSearchParams({
      symbol: symbol.trim(),
      interval,
      from: from.trim(),
      to: to.trim(),
      length: String(length),
      confirm_bars: String(confirmBars),
    });

    let stratResult: ApiOk;
    try {
      const r = await fetch(`/api/kite/ma-cross?${q.toString()}`);
      const j = (await r.json()) as { error?: string } & Partial<ApiOk>;
      if (!r.ok) {
        setExecOrderErr(j.error || r.statusText);
        setExecLoading(false);
        return;
      }
      stratResult = j as ApiOk;
      setResult(stratResult);
    } catch (caught) {
      setExecOrderErr(caught instanceof Error ? caught.message : "strategy fetch failed");
      setExecLoading(false);
      return;
    }

    const { longEntry, shortEntry } = stratResult.latest;
    if (!longEntry && !shortEntry) {
      setExecOrderErr("No active signal — longEntry and shortEntry are both false on the latest bar.");
      setExecLoading(false);
      return;
    }

    const rawSymbol = symbol.trim();
    const colonIdx = rawSymbol.indexOf(":");
    const exchange = colonIdx > -1 ? rawSymbol.slice(0, colonIdx).toUpperCase() : "NSE";
    const tradingsymbol = colonIdx > -1 ? rawSymbol.slice(colonIdx + 1) : rawSymbol;
    const txType = longEntry ? "BUY" : "SELL";

    try {
      const res = await postKitePlaceOrder({
        variety: "regular",
        exchange,
        tradingsymbol,
        transaction_type: txType,
        quantity: execQty,
        product: execProduct,
        order_type: "MARKET",
        validity: "DAY",
        tag: "macross",
      });
      setExecOrderResult({ txType, ...res });
    } catch (caught) {
      setExecOrderErr(caught instanceof Error ? caught.message : "order placement failed");
    } finally {
      setExecLoading(false);
    }
  }

  const tail = result?.series?.slice(-40) ?? [];
  const last = result?.latest?.last;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={onSubmit}
      >
        <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="text-zinc-600 dark:text-zinc-400">Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="MCX:CRUDEOILM26APRFUT"
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Interval</span>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">SMA length</span>
          <input
            type="number"
            min={1}
            max={500}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Confirm bars</span>
          <input
            type="number"
            min={1}
            max={100}
            value={confirmBars}
            onChange={(e) => setConfirmBars(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">From (IST)</span>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">To (IST)</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <p className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">
          SMA uses the last {length} closes (same as Pine <code className="font-mono">ta.sma(close, length)</code>
          ). Long/short fire after {confirmBars} consecutive closes above/below that MA.
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Qty (execute)</span>
          <input
            type="number"
            min={1}
            value={execQty}
            onChange={(e) => setExecQty(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Product (execute)</span>
          <select
            value={execProduct}
            onChange={(e) => setExecProduct(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="MIS">MIS</option>
            <option value="NRML">NRML</option>
            <option value="CNC">CNC</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
          >
            {loading ? "Loading…" : "Run strategy"}
          </button>
          {!liveActive ? (
            <button
              type="button"
              onClick={() => void startLive()}
              className="rounded-lg border border-emerald-700/40 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-600/50 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              Start live (WebSocket)
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLive}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
            >
              Stop live
            </button>
          )}
          <button
            type="button"
            disabled={execLoading || loading}
            onClick={(e) => void onExecute(e as unknown as FormEvent)}
            className="rounded-lg border border-violet-700/40 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 disabled:opacity-50 dark:border-violet-600/50 dark:bg-violet-950/40 dark:text-violet-100"
          >
            {execLoading ? "Executing…" : "Execute strategy"}
          </button>
        </div>
      </form>

      {execOrderErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Execute: {execOrderErr}
        </p>
      ) : null}

      {execOrderResult ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            execOrderResult.ok
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
          }`}
        >
          {execOrderResult.ok ? (
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              Order placed — {execOrderResult.txType} · order id{" "}
              <span className="font-mono">{execOrderResult.orderId}</span>
            </p>
          ) : (
            <p className="font-medium text-red-700 dark:text-red-300">
              Order failed ({execOrderResult.txType}): {execOrderResult.error}
            </p>
          )}
        </div>
      ) : null}

      {liveErr ? (
        <p className="text-sm text-red-600 dark:text-red-400">{liveErr}</p>
      ) : null}

      {liveReady ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <h2 className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Live strategy (Kite ticker)
          </h2>
          <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/80">
            Quotes stream via{" "}
            <a
              href="https://www.kite.trade/docs/connect/v3/websocket/"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              Kite WebSocket
            </a>
            ; LTP updates the last candle close, then the same MA-cross logic runs. That makes
            close vs MA flip tick-by-tick on a forming bar, so the signal table debounces live rows
            to about one per selected interval.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-zinc-500">Range loaded</p>
              <p className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {liveReady.from} → {liveReady.to}
              </p>
              <p className="text-xs text-zinc-500">{liveReady.bars} bars · {liveReady.interval}</p>
              {liveReady.range_clamped ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
                  Range shortened for this interval (Kite limits intraday history width).
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">LTP (live)</p>
              <p className="mt-1 font-mono text-lg font-semibold">
                {liveTick != null ? liveTick.ltp.toFixed(2) : "—"}
              </p>
              {liveTick == null && liveReady.latest.last != null ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Last candle close {liveReady.latest.last.close.toFixed(2)} until first tick
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">SMA (on live series)</p>
              <p className="mt-1 font-mono text-lg">
                {liveTick?.latest.last?.sma != null
                  ? liveTick.latest.last.sma.toFixed(4)
                  : liveReady.latest.last?.sma != null
                    ? liveReady.latest.last.sma.toFixed(4)
                    : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Signals</p>
              <p className="mt-1 text-sm">
                Long:{" "}
                <span
                  className={
                    (liveTick?.latest ?? liveReady.latest).longEntry
                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                      : "text-zinc-500"
                  }
                >
                  {(liveTick?.latest ?? liveReady.latest).longEntry ? "yes" : "no"}
                </span>
                {" · "}
                Short:{" "}
                <span
                  className={
                    (liveTick?.latest ?? liveReady.latest).shortEntry
                      ? "font-semibold text-rose-700 dark:text-rose-400"
                      : "text-zinc-500"
                  }
                >
                  {(liveTick?.latest ?? liveReady.latest).shortEntry ? "yes" : "no"}
                </span>
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      ) : null}

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs uppercase text-zinc-500">Resolved</p>
              <p className="mt-1 font-medium">{result.symbol}</p>
              <p className="text-xs text-zinc-500">token {result.instrument_token}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs uppercase text-zinc-500">Last close</p>
              <p className="mt-1 font-mono text-lg font-medium">
                {last != null ? last.close.toFixed(2) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs uppercase text-zinc-500">Last SMA</p>
              <p className="mt-1 font-mono text-lg font-medium">
                {last?.sma != null ? last.sma.toFixed(4) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs uppercase text-zinc-500">Signals (last bar)</p>
              <p className="mt-1 text-sm">
                Long:{" "}
                <span
                  className={
                    result.latest.longEntry
                      ? "font-semibold text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-500"
                  }
                >
                  {result.latest.longEntry ? "yes" : "no"}
                </span>
                {" · "}
                Short:{" "}
                <span
                  className={
                    result.latest.shortEntry
                      ? "font-semibold text-rose-600 dark:text-rose-400"
                      : "text-zinc-500"
                  }
                >
                  {result.latest.shortEntry ? "yes" : "no"}
                </span>
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Last 40 bars (oldest → newest in range)
            </h2>
            <div className="mt-2 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-100 dark:bg-zinc-900">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Close</th>
                    <th className="px-2 py-2 font-medium">SMA</th>
                    <th className="px-2 py-2 font-medium">Above</th>
                    <th className="px-2 py-2 font-medium">Below</th>
                    <th className="px-2 py-2 font-medium">Long</th>
                    <th className="px-2 py-2 font-medium">Short</th>
                  </tr>
                </thead>
                <tbody>
                  {tail.map((row) => (
                    <tr
                      key={row.index}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-2 py-1.5 font-mono text-zinc-500">
                        {row.index}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{row.close.toFixed(2)}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {row.sma != null ? row.sma.toFixed(4) : "—"}
                      </td>
                      <td className="px-2 py-1.5">{row.aboveCount}</td>
                      <td className="px-2 py-1.5">{row.belowCount}</td>
                      <td className="px-2 py-1.5">
                        {row.longEntry ? (
                          <span className="text-emerald-600 dark:text-emerald-400">●</span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.shortEntry ? (
                          <span className="text-rose-600 dark:text-rose-400">●</span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Total bars in range: {result.series.length}. Uses Kite historical candles (close
              only); times follow Kite / interval settings.
            </p>
          </div>
        </>
      ) : null}

      {allSignalRows.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Recorded signals
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Backtest: one row per bar where MACrossLE / MACrossSE fires. Live: same edge rule, but
            rows are limited to at most once per chart interval (e.g. 1 per minute on 1m) so LTP
            ticks don’t log the same entry many times while price wiggles around the MA.
          </p>
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                <tr>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                  <th className="px-2 py-2 font-medium">Close / LTP</th>
                  <th className="px-2 py-2 font-medium">SMA</th>
                </tr>
              </thead>
              <tbody>
                {allSignalRows.map((r) => (
                  <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5 capitalize text-zinc-600 dark:text-zinc-400">
                      {r.source}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.time}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          r.side === "long"
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : "font-medium text-rose-600 dark:text-rose-400"
                        }
                      >
                        {r.side === "long" ? "MACrossLE" : "MACrossSE"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">{r.close.toFixed(2)}</td>
                    <td className="px-2 py-1.5 font-mono">
                      {r.sma != null ? r.sma.toFixed(4) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
