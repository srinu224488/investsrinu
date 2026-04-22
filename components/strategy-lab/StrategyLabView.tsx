"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type StrategyKind =
  | "ema"
  | "rsi"
  | "fib"
  | "htf"
  | "volume"
  | "roundbottom";

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

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MAX_WATCHLIST = 50;
const BATCH_CONCURRENCY = 4;

/** Lines, commas, or semicolons — bare symbol or EXCHANGE:SYMBOL */
function parseWatchlist(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/u);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const s = p.trim().toUpperCase();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  }

  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

type BatchRow =
  | { symbol: string; ok: true; data: unknown }
  | { symbol: string; ok: false; error: string };

type LiveSignalRow = {
  key: string;
  time: string;
  message: string;
  variant: "long" | "short" | "bear" | "bull" | "info";
};

type EmaStreamReady = {
  type: "ready";
  symbol: string;
  interval: string;
  strategy: { length: number; confirmBars: number };
  latest: {
    last: {
      close: number;
      ema: number | null;
      longEntry: boolean;
      shortEntry: boolean;
      aboveCount?: number;
      belowCount?: number;
    } | null;
    longEntry: boolean;
    shortEntry: boolean;
  };
};

type EmaStreamTick = {
  type: "tick";
  ltp: number;
  latest: EmaStreamReady["latest"];
  at: number;
};

type RsiBarLite = {
  rsi: number | null;
  divergenceBearish: boolean;
  divergenceBullish: boolean;
  pivotHigh: boolean;
  pivotLow: boolean;
  close: number;
};

type RsiStreamReady = {
  type: "ready";
  symbol: string;
  interval: string;
  strategy: { period: number; pivotLeft: number; pivotRight: number };
  latest: RsiBarLite | null;
};

type RsiStreamTick = {
  type: "tick";
  ltp: number;
  latest: RsiBarLite | null;
  at: number;
};

export default function StrategyLabView() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [kind, setKind] = useState<StrategyKind>("ema");
  const [watchlist, setWatchlist] = useState(
    "RELIANCE\nINFY\nTCS\nHDFCBANK\nICICIBANK",
  );
  const symbols = useMemo(() => parseWatchlist(watchlist), [watchlist]);
  const firstSymbol = symbols[0] ?? "";
  const [interval, setInterval] = useState<string>("5minute");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const [emaLength, setEmaLength] = useState(21);
  const [confirmBars, setConfirmBars] = useState(1);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [pivotLeft, setPivotLeft] = useState(2);
  const [pivotRight, setPivotRight] = useState(2);
  const [htfInterval, setHtfInterval] = useState<string>("day");
  const [volSma, setVolSma] = useState(20);

  const [rbUniverse, setRbUniverse] = useState<"nifty200" | "eq_alpha">(
    "nifty200",
  );
  const [rbNse, setRbNse] = useState(true);
  const [rbBse, setRbBse] = useState(true);
  const [rbMaxSymbols, setRbMaxSymbols] = useState(200);
  const [rbTopN, setRbTopN] = useState(50);
  const [rbSpacingMs, setRbSpacingMs] = useState(400);

  const [rbPreview, setRbPreview] = useState<{
    universe_source?: string;
    universe: {
      nse_eq: number;
      bse_eq: number;
      scanned: number;
      max_symbols: number;
      nifty200_csv_rows?: number;
    };
    symbols: {
      instrument_key: string;
      exchange: string;
      tradingsymbol: string;
    }[];
  } | null>(null);
  const [rbPreviewLoading, setRbPreviewLoading] = useState(false);
  const [rbPreviewErr, setRbPreviewErr] = useState<string | null>(null);
  const [rbMinDdPct, setRbMinDdPct] = useState(6);
  const [rbMinBaseBars, setRbMinBaseBars] = useState(18);
  const [rbVolLookback, setRbVolLookback] = useState(60);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);

  const liveAbortRef = useRef<AbortController | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [emaLive, setEmaLive] = useState<{
    ltp: number | null;
    latest: EmaStreamReady["latest"] | null;
    at: number | null;
    meta: string | null;
  }>({ ltp: null, latest: null, at: null, meta: null });

  const [rsiLive, setRsiLive] = useState<{
    ltp: number | null;
    latest: RsiBarLite | null;
    at: number | null;
    meta: string | null;
  }>({ ltp: null, latest: null, at: null, meta: null });

  const emaEdgeRef = useRef({ long: false, short: false });
  const rsiEdgeRef = useRef({ bear: false, bull: false });
  const lastEmaLongAt = useRef(0);
  const lastEmaShortAt = useRef(0);
  const lastRsiBearAt = useRef(0);
  const lastRsiBullAt = useRef(0);
  const [signalLog, setSignalLog] = useState<LiveSignalRow[]>([]);
  const signalKey = useRef(0);

  const pushSignal = useCallback((row: Omit<LiveSignalRow, "key">) => {
    signalKey.current += 1;
    setSignalLog((prev) => {
      const next = [
        ...prev,
        { ...row, key: `s-${signalKey.current}` },
      ];
      return next.slice(-80);
    });
  }, []);

  const stopLive = useCallback(() => {
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    setLiveActive(false);
    emaEdgeRef.current = { long: false, short: false };
    rsiEdgeRef.current = { bear: false, bull: false };
  }, []);

  const startLive = useCallback(() => {
    stopLive();
    setLiveErr(null);
    setEmaLive({ ltp: null, latest: null, at: null, meta: null });
    setRsiLive({ ltp: null, latest: null, at: null, meta: null });
    emaEdgeRef.current = { long: false, short: false };
    rsiEdgeRef.current = { bear: false, bull: false };

    const sym = firstSymbol.trim();
    if (!sym) return;
    const q = new URLSearchParams({ symbol: sym, interval });
    if (from.trim() && to.trim()) {
      q.set("from", from.trim());
      q.set("to", to.trim());
    }

    if (kind === "ema") {
      q.set("length", String(emaLength));
      q.set("confirm_bars", String(confirmBars));
    } else if (kind === "rsi") {
      q.set("period", String(rsiPeriod));
      q.set("pivot_left", String(pivotLeft));
      q.set("pivot_right", String(pivotRight));
    } else {
      return;
    }

    const path =
      kind === "ema"
        ? `/api/kite/ema/stream?${q}`
        : `/api/kite/rsi/stream?${q}`;
    const ac = new AbortController();
    liveAbortRef.current = ac;
    setLiveActive(true);

    void (async () => {
      try {
        const res = await fetch(path, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setLiveErr(j.error ?? `HTTP ${res.status}`);
          setLiveActive(false);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setLiveErr("no_response_body");
          setLiveActive(false);
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
                const j = JSON.parse(raw) as Record<string, unknown>;
                if (kind === "ema") {
                  if (j.type === "ready") {
                    const r = j as unknown as EmaStreamReady;
                    setEmaLive({
                      ltp: null,
                      latest: r.latest,
                      at: null,
                      meta: `${r.symbol} · ${r.interval} · EMA(${r.strategy.length})`,
                    });
                    emaEdgeRef.current = {
                      long: Boolean(r.latest.longEntry),
                      short: Boolean(r.latest.shortEntry),
                    };
                  } else if (j.type === "tick") {
                    const t = j as unknown as EmaStreamTick;
                    setEmaLive((prev) => ({
                      ltp: t.ltp,
                      latest: t.latest,
                      at: t.at,
                      meta:
                        prev.meta ??
                        `${firstSymbol.trim()} · ${interval} · EMA(${emaLength})`,
                    }));
                    const prev = emaEdgeRef.current;
                    const lg = Boolean(t.latest.longEntry);
                    const sh = Boolean(t.latest.shortEntry);
                    const cool = liveSignalCooldownMs(interval);
                    const now = t.at;
                    if (
                      lg &&
                      !prev.long &&
                      now - lastEmaLongAt.current >= cool
                    ) {
                      lastEmaLongAt.current = now;
                      pushSignal({
                        time: new Date(now).toLocaleString("en-IN", {
                          hour12: false,
                        }),
                        message: `Long continuation: ${confirmBars} close(s) above EMA(${emaLength}) (live LTP vs series).`,
                        variant: "long",
                      });
                    }
                    if (
                      sh &&
                      !prev.short &&
                      now - lastEmaShortAt.current >= cool
                    ) {
                      lastEmaShortAt.current = now;
                      pushSignal({
                        time: new Date(now).toLocaleString("en-IN", {
                          hour12: false,
                        }),
                        message: `Short continuation: ${confirmBars} close(s) below EMA(${emaLength}).`,
                        variant: "short",
                      });
                    }
                    emaEdgeRef.current = { long: lg, short: sh };
                  } else if (j.type === "error") {
                    setLiveErr(String(j.message ?? "stream_error"));
                    stopLive();
                  } else if (j.type === "closed") {
                    stopLive();
                  }
                } else if (kind === "rsi") {
                  if (j.type === "ready") {
                    const r = j as unknown as RsiStreamReady;
                    setRsiLive({
                      ltp: null,
                      latest: r.latest,
                      at: null,
                      meta: `${r.symbol} · ${r.interval} · RSI(${r.strategy.period})`,
                    });
                    const last = r.latest;
                    rsiEdgeRef.current = {
                      bear: Boolean(last?.divergenceBearish),
                      bull: Boolean(last?.divergenceBullish),
                    };
                  } else if (j.type === "tick") {
                    const t = j as unknown as RsiStreamTick;
                    setRsiLive((prev) => ({
                      ltp: t.ltp,
                      latest: t.latest,
                      at: t.at,
                      meta:
                        prev.meta ??
                        `${firstSymbol.trim()} · ${interval} · RSI(${rsiPeriod})`,
                    }));
                    const last = t.latest;
                    const prev = rsiEdgeRef.current;
                    const bear = Boolean(last?.divergenceBearish);
                    const bull = Boolean(last?.divergenceBullish);
                    const cool = liveSignalCooldownMs(interval);
                    const now = t.at;
                    if (
                      bear &&
                      !prev.bear &&
                      now - lastRsiBearAt.current >= cool
                    ) {
                      lastRsiBearAt.current = now;
                      pushSignal({
                        time: new Date(now).toLocaleString("en-IN", {
                          hour12: false,
                        }),
                        message:
                          "Regular bearish divergence: higher pivot high in price vs lower in RSI (heuristic on OHLC).",
                        variant: "bear",
                      });
                    }
                    if (
                      bull &&
                      !prev.bull &&
                      now - lastRsiBullAt.current >= cool
                    ) {
                      lastRsiBullAt.current = now;
                      pushSignal({
                        time: new Date(now).toLocaleString("en-IN", {
                          hour12: false,
                        }),
                        message:
                          "Regular bullish divergence: lower pivot low in price vs higher in RSI (heuristic on OHLC).",
                        variant: "bull",
                      });
                    }
                    rsiEdgeRef.current = { bear, bull };
                  } else if (j.type === "error") {
                    setLiveErr(String(j.message ?? "stream_error"));
                    stopLive();
                  } else if (j.type === "closed") {
                    stopLive();
                  }
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
        if (!ac.signal.aborted) setLiveActive(false);
        if (liveAbortRef.current === ac) liveAbortRef.current = null;
      }
    })();
  }, [
    kind,
    firstSymbol,
    interval,
    from,
    to,
    emaLength,
    confirmBars,
    rsiPeriod,
    pivotLeft,
    pivotRight,
    stopLive,
    pushSignal,
  ]);

  useEffect(() => {
    return () => {
      liveAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (kind !== "roundbottom") {
      setRbPreview(null);
      setRbPreviewErr(null);
      setRbPreviewLoading(false);
      return;
    }
    if (rbUniverse === "eq_alpha") {
      const ex: string[] = [];
      if (rbNse) ex.push("nse");
      if (rbBse) ex.push("bse");
      if (ex.length === 0) {
        setRbPreview(null);
        setRbPreviewErr(null);
        return;
      }
    }
    const ac = new AbortController();
    setRbPreviewLoading(true);
    setRbPreviewErr(null);
    const q = new URLSearchParams({
      preview: "1",
      universe: rbUniverse,
      max_symbols: String(rbMaxSymbols),
    });
    if (rbUniverse === "eq_alpha") {
      const ex: string[] = [];
      if (rbNse) ex.push("nse");
      if (rbBse) ex.push("bse");
      q.set("exchanges", ex.join(","));
    }
    void fetch(`/api/kite/round-bottom-scan?${q.toString()}`, {
      credentials: "include",
      signal: ac.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const j = (await res.json()) as {
          error?: string;
          universe_source?: string;
          universe?: {
            nse_eq: number;
            bse_eq: number;
            scanned: number;
            max_symbols: number;
            nifty200_csv_rows?: number;
          };
          symbols?: {
            instrument_key: string;
            exchange: string;
            tradingsymbol: string;
          }[];
        };
        if (!res.ok) {
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        if (!j.universe || !j.symbols) {
          throw new Error("invalid_preview_response");
        }
        setRbPreview({
          universe_source: j.universe_source,
          universe: j.universe,
          symbols: j.symbols,
        });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof Error && e.name === "AbortError") return;
        setRbPreviewErr(e instanceof Error ? e.message : "preview_failed");
        setRbPreview(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setRbPreviewLoading(false);
      });
    return () => ac.abort();
  }, [kind, rbUniverse, rbNse, rbBse, rbMaxSymbols]);

  const runFetch = useCallback(async () => {
    setErr(null);
    setPayload(null);
    setBatchRows([]);
    if (kind !== "roundbottom" && symbols.length === 0) {
      setErr("Add at least one symbol to the watchlist.");
      return;
    }
    setLoading(true);
    try {
      const fromS = from.trim();
      const toS = to.trim();

      async function fetchOne(sym: string): Promise<BatchRow> {
        const q = new URLSearchParams();
        q.set("from", fromS);
        q.set("to", toS);
        if (kind !== "roundbottom") q.set("symbol", sym);
        let path = "";
        if (kind === "ema") {
          path = "/api/kite/ema";
          q.set("interval", interval);
          q.set("length", String(emaLength));
          q.set("confirm_bars", String(confirmBars));
        } else if (kind === "rsi") {
          path = "/api/kite/rsi";
          q.set("interval", interval);
          q.set("period", String(rsiPeriod));
          q.set("pivot_left", String(pivotLeft));
          q.set("pivot_right", String(pivotRight));
        } else if (kind === "fib") {
          path = "/api/kite/fib";
          q.set("interval", interval);
          q.set("pivot_left", String(pivotLeft));
          q.set("pivot_right", String(pivotRight));
        } else if (kind === "htf") {
          path = "/api/kite/htf-levels";
          q.set("htf_interval", htfInterval);
        } else if (kind === "volume") {
          path = "/api/kite/volume-stats";
          q.set("interval", interval);
          q.set("sma_length", String(volSma));
        } else if (kind === "roundbottom") {
          q.set("universe", rbUniverse);
          if (rbUniverse === "eq_alpha") {
            const ex: string[] = [];
            if (rbNse) ex.push("nse");
            if (rbBse) ex.push("bse");
            if (ex.length === 0) {
              return {
                symbol: "_",
                ok: false,
                error: "Select NSE and/or BSE.",
              };
            }
            q.set("exchanges", ex.join(","));
          }
          q.set("max_symbols", String(rbMaxSymbols));
          q.set("top_n", String(rbTopN));
          q.set("spacing_ms", String(rbSpacingMs));
          q.set("min_drawdown_pct", String(rbMinDdPct));
          q.set("min_base_bars", String(rbMinBaseBars));
          q.set("vol_lookback", String(rbVolLookback));
          q.set("pivot_left", String(pivotLeft));
          q.set("pivot_right", String(pivotRight));
          path = "/api/kite/round-bottom-scan";
        }

        try {
          const res = await fetch(`${path}?${q.toString()}`, {
            credentials: "include",
            cache: "no-store",
          });
          const j = (await res.json()) as { error?: string };
          if (!res.ok) {
            return {
              symbol: sym,
              ok: false,
              error: j.error || `HTTP ${res.status}`,
            };
          }
          return { symbol: sym, ok: true, data: j };
        } catch (e) {
          return {
            symbol: sym,
            ok: false,
            error: e instanceof Error ? e.message : "fetch_failed",
          };
        }
      }

      if (kind === "roundbottom") {
        const row = await fetchOne("_");
        if (!row.ok) {
          setErr(row.error);
          return;
        }
        setPayload(row.data);
        return;
      }

      if (symbols.length === 1) {
        const row = await fetchOne(symbols[0]!);
        if (!row.ok) {
          setErr(row.error);
          return;
        }
        setPayload(row.data);
        return;
      }

      const rows = await mapLimit(symbols, BATCH_CONCURRENCY, (sym) =>
        fetchOne(sym),
      );
      setBatchRows(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [
    symbols,
    kind,
    from,
    to,
    interval,
    emaLength,
    confirmBars,
    rsiPeriod,
    pivotLeft,
    pivotRight,
    htfInterval,
    volSma,
    rbUniverse,
    rbNse,
    rbBse,
    rbMaxSymbols,
    rbTopN,
    rbSpacingMs,
    rbMinDdPct,
    rbMinBaseBars,
    rbVolLookback,
  ]);

  const liveKind = kind === "ema" || kind === "rsi";

  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300"
        aria-labelledby="strategy-lab-how-heading"
      >
        <h2
          id="strategy-lab-how-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400"
        >
          How this works
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Watchlist</dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed">
              Paste multiple tickers (one per line, or comma-separated). Names are deduplicated (max{" "}
              {MAX_WATCHLIST}). Bare symbols default like NSE cash via Kite. Batch snapshot requests run
              up to {BATCH_CONCURRENCY} symbols at a time against the same date range and strategy
              settings.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Historical snapshot</dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed">
              Loads candles from Kite between <strong className="font-medium">From</strong> and{" "}
              <strong className="font-medium">To</strong> (IST), then computes the selected mode. One
              symbol shows summary cards plus optional raw JSON. Several symbols produce a single results
              table with one row per symbol (errors shown per row).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Live stream (EMA / RSI only)</dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed">
              Uses the same interval and parameters but subscribes to{" "}
              <strong className="font-medium">last traded price</strong> and substitutes it into the{" "}
              <em>forming</em> candle so indicators update tick-by-tick. Only the{" "}
              <strong className="font-medium">first</strong> watchlist symbol is streamed (one socket).
              Signals in the log fire on edge + cooldown so repeated ticks do not spam.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Modes</dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed">
              <strong className="font-medium">EMA</strong>: consecutive closes above/below EMA ·{" "}
              <strong className="font-medium">RSI</strong>: Wilder RSI and pivot-based divergence hints ·{" "}
              <strong className="font-medium">Fib</strong>: last pivot impulse + retracement levels ·{" "}
              <strong className="font-medium">HTF</strong>: higher timeframe bars expanded to O/H/L/C ·{" "}
              <strong className="font-medium">Volume</strong>: SMA of volume and relative volume ·{" "}
              <strong className="font-medium">Round bottom</strong>: daily heuristic on{" "}
              <strong className="font-medium">CNX Nifty 200</strong> (NSE CSV) or merged A–Z EQ; then scoring
              (drawdown, base length, higher pivot lows, breakout vs range high, volume z-score).
            </dd>
          </div>
        </dl>
      </section>

      {liveKind && (
        <section className="rounded-2xl border border-teal-200/80 bg-gradient-to-b from-teal-50/90 to-white p-4 shadow-sm dark:border-teal-900/50 dark:from-teal-950/30 dark:to-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200/60 pb-3 dark:border-teal-900/40">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-200">
              Live (Kite WebSocket LTP)
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startLive()}
                disabled={liveActive || !firstSymbol.trim()}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Start stream
              </button>
              <button
                type="button"
                onClick={stopLive}
                disabled={!liveActive}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => setSignalLog([])}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Clear log
              </button>
            </div>
          </div>

          {liveErr && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              {liveErr}
            </p>
          )}

          {symbols.length > 1 && (
            <p className="mt-2 text-xs text-teal-800/90 dark:text-teal-300/90">
              Live stream uses the first symbol in the list ({firstSymbol}). Batch snapshot below
              runs all {symbols.length} symbols.
            </p>
          )}

          {kind === "ema" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Symbol
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {emaLive.meta?.split("·")[0]?.trim() ?? firstSymbol.trim()}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  LTP
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {fmtPrice(emaLive.ltp)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  EMA
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {fmtPrice(emaLive.latest?.last?.ema ?? null)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Streak / bias
                </p>
                <p className="mt-1 text-sm leading-snug text-zinc-800 dark:text-zinc-200">
                  Above EMA: {emaLive.latest?.last?.aboveCount ?? "—"} bars · Below:{" "}
                  {emaLive.latest?.last?.belowCount ?? "—"}
                </p>
              </div>
            </div>
          )}

          {kind === "rsi" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Symbol
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {rsiLive.meta?.split("·")[0]?.trim() ?? firstSymbol.trim()}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  LTP
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {fmtPrice(rsiLive.ltp)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  RSI
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {rsiLive.latest?.rsi !== null &&
                  rsiLive.latest?.rsi !== undefined
                    ? rsiLive.latest.rsi.toFixed(1)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Context
                </p>
                <p className="mt-1 text-xs leading-snug text-zinc-700 dark:text-zinc-300">
                  Pivot H/L on chart · Divergence fires when last pivot confirms (OHLC heuristic).
                </p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Signal log
            </h3>
            {signalLog.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Start the stream during market hours. New signals append when conditions
                trigger (deduped by bar-sized cooldown).
              </p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                {signalLog
                  .slice()
                  .reverse()
                  .map((s) => (
                    <li
                      key={s.key}
                      className={`rounded-md px-2 py-1.5 text-sm ${
                        s.variant === "long"
                          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                          : s.variant === "short"
                            ? "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
                            : s.variant === "bear"
                              ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                              : s.variant === "bull"
                                ? "bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"
                                : "bg-zinc-50 text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-zinc-500">
                        {s.time}
                      </span>
                      <span className="ml-2">{s.message}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Setup & historical snapshot
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Strategy
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StrategyKind)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="ema">EMA confirm</option>
              <option value="rsi">RSI + divergence</option>
              <option value="fib">Fib (pivot impulse)</option>
              <option value="htf">HTF O/H/L/C zones</option>
              <option value="volume">Volume stats</option>
              <option value="roundbottom">Round bottom scan</option>
            </select>
          </label>
          {(kind === "ema" ||
            kind === "rsi" ||
            kind === "fib" ||
            kind === "volume") && (
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Interval
              </span>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "roundbottom" && (
            <div className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Interval
              </span>
              <p className="h-9 rounded-md border border-dashed border-zinc-300 px-2 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                Day (full EQ universe subset)
              </p>
            </div>
          )}
          {kind === "htf" && (
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                HTF interval
              </span>
              <select
                value={htfInterval}
                onChange={(e) => setHtfInterval(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="mt-4 grid gap-1 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Watchlist ({symbols.length} symbol{symbols.length !== 1 ? "s" : ""}, max{" "}
            {MAX_WATCHLIST})
            {kind === "roundbottom" && (
              <span className="font-normal text-zinc-500">
                {" "}
                — not used by universe scan
              </span>
            )}
          </span>
          <textarea
            value={watchlist}
            onChange={(e) => setWatchlist(e.target.value)}
            rows={5}
            spellCheck={false}
            disabled={kind === "roundbottom"}
            className="min-h-[7rem] w-full rounded-md border border-zinc-200 bg-white px-2 py-2 font-mono text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder={
              "One symbol per line, or comma-separated.\nRELIANCE\nINFY\nNSE:TCS"
            }
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              From (IST)
            </span>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              To (IST)
            </span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        {kind === "ema" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                EMA length
              </span>
              <input
                type="number"
                min={1}
                max={500}
                value={emaLength}
                onChange={(e) => setEmaLength(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Confirm bars
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={confirmBars}
                onChange={(e) => setConfirmBars(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {kind === "rsi" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                RSI period
              </span>
              <input
                type="number"
                min={2}
                max={100}
                value={rsiPeriod}
                onChange={(e) => setRsiPeriod(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot left
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={pivotLeft}
                onChange={(e) => setPivotLeft(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot right
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={pivotRight}
                onChange={(e) => setPivotRight(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {kind === "fib" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot left
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={pivotLeft}
                onChange={(e) => setPivotLeft(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot right
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={pivotRight}
                onChange={(e) => setPivotRight(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {kind === "volume" && (
          <div className="mt-3 max-w-xs">
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Volume SMA length
              </span>
              <input
                type="number"
                min={2}
                max={200}
                value={volSma}
                onChange={(e) => setVolSma(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {kind === "roundbottom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Universe
              </span>
              <select
                value={rbUniverse}
                onChange={(e) =>
                  setRbUniverse(e.target.value as "nifty200" | "eq_alpha")
                }
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="nifty200">
                  CNX Nifty 200 (NSE CSV → Kite NSE EQ)
                </option>
                <option value="eq_alpha">
                  All EQ alphabetical (NSE/BSE merge)
                </option>
              </select>
              <span className="text-[10px] text-zinc-500">
                Nifty 200 uses{" "}
                <span className="font-mono text-[10px]">
                  nsearchives.nseindia.com/.../ind_nifty200list.csv
                </span>
                .
              </span>
            </label>
            {rbUniverse === "eq_alpha" && (
              <fieldset className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700 sm:col-span-2">
                <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Exchanges
                </legend>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rbNse}
                    onChange={(e) => setRbNse(e.target.checked)}
                  />
                  NSE EQ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rbBse}
                    onChange={(e) => setRbBse(e.target.checked)}
                  />
                  BSE EQ
                </label>
              </fieldset>
            )}
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Max symbols
              </span>
              <input
                type="number"
                min={10}
                max={500}
                value={rbMaxSymbols}
                onChange={(e) => setRbMaxSymbols(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Top N results
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={rbTopN}
                onChange={(e) => setRbTopN(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Spacing (ms)
              </span>
              <input
                type="number"
                min={0}
                max={3000}
                step={50}
                value={rbSpacingMs}
                onChange={(e) => setRbSpacingMs(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span className="text-[10px] text-zinc-500">
                Delay between Kite historical calls (rate limit ~3/s).
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Min drawdown (%)
              </span>
              <input
                type="number"
                min={2}
                max={55}
                step={0.5}
                value={rbMinDdPct}
                onChange={(e) => setRbMinDdPct(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Min base bars
              </span>
              <input
                type="number"
                min={8}
                max={80}
                value={rbMinBaseBars}
                onChange={(e) => setRbMinBaseBars(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Vol lookback (z-score)
              </span>
              <input
                type="number"
                min={15}
                max={120}
                value={rbVolLookback}
                onChange={(e) => setRbVolLookback(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot left
              </span>
              <input
                type="number"
                min={1}
                max={8}
                value={pivotLeft}
                onChange={(e) => setPivotLeft(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Pivot right
              </span>
              <input
                type="number"
                min={1}
                max={8}
                value={pivotRight}
                onChange={(e) => setPivotRight(Number(e.target.value))}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {kind === "roundbottom" && (
          <div
            className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
            aria-live="polite"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Scan list ({rbUniverse === "eq_alpha" ? "A–Z EQ" : "Nifty 200 order"})
            </h3>
            {rbPreviewLoading && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                Loading instrument list…
              </p>
            )}
            {rbPreviewErr && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                {rbPreviewErr}
              </p>
            )}
            {rbPreview && !rbPreviewLoading && (
              <>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                    Scanned {rbPreview.universe.scanned}
                  </strong>{" "}
                  of max {rbPreview.universe.max_symbols}
                  {rbPreview.universe_source === "nifty200" &&
                  rbPreview.universe.nifty200_csv_rows != null
                    ? ` · Nifty 200 CSV rows ${rbPreview.universe.nifty200_csv_rows}`
                    : null}
                  {rbPreview.universe_source !== "nifty200" && (
                    <>
                      {" "}
                      (Kite universe: NSE EQ {rbPreview.universe.nse_eq} · BSE EQ{" "}
                      {rbPreview.universe.bse_eq})
                    </>
                  )}
                  {rbPreview.universe_source === "nifty200" && (
                    <> · Kite NSE EQ rows {rbPreview.universe.nse_eq} for lookup</>
                  )}
                  . Resolved before any OHLC request.
                </p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200">
                  {rbPreview.symbols.map((s) => s.instrument_key).join("\n")}
                </pre>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void runFetch()}
          disabled={
            loading ||
            (kind !== "roundbottom" && symbols.length === 0) ||
            (kind === "roundbottom" &&
              rbUniverse === "eq_alpha" &&
              !rbNse &&
              !rbBse)
          }
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading
            ? "Loading…"
            : kind === "roundbottom"
              ? "Run universe scan"
              : symbols.length > 1
                ? `Run snapshot on ${symbols.length} symbols`
                : "Refresh snapshot"}
        </button>
        {liveKind && (
          <p className="mt-2 text-xs text-zinc-500">
            Historical window for chart context. Live stream uses the first watchlist symbol,
            interval, and parameters above.
          </p>
        )}
      </section>

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {batchRows.length > 0 && (
        <BatchResultsTable kind={kind} rows={batchRows} />
      )}

      {(kind === "roundbottom" || symbols.length <= 1) &&
        payload !== null &&
        typeof payload === "object" && (
          <SnapshotCards kind={kind} data={payload} />
        )}

      {(kind === "roundbottom" || symbols.length <= 1) &&
        payload !== null &&
        typeof payload === "object" && (
          <details className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
            <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Raw API JSON
            </summary>
            <pre className="max-h-48 overflow-auto border-t border-zinc-200 p-3 text-[10px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        )}

      {batchRows.length > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Raw batch JSON
          </summary>
          <pre className="max-h-48 overflow-auto border-t border-zinc-200 p-3 text-[10px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            {JSON.stringify(batchRows, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function BatchResultsTable({
  kind,
  rows,
}: {
  kind: StrategyKind;
  rows: BatchRow[];
}) {
  const th =
    "border-b border-zinc-200 py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700";
  const td = "border-b border-zinc-100 py-2 pr-3 align-top dark:border-zinc-800";

  function fib618(data: unknown): string {
    const d = data as {
      fib_levels?: { ratio: number; price: number }[];
    };
    const row = d.fib_levels?.find((x) => Math.abs(x.ratio - 0.618) < 1e-6);
    return row ? fmtPrice(row.price) : "—";
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Batch results ({rows.length} symbols)
      </h3>
      <div className="mt-3 max-h-[min(70vh,520px)] overflow-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 bg-white dark:bg-zinc-950">
            {kind === "ema" && (
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>Close</th>
                <th className={th}>EMA</th>
                <th className={th}>Long</th>
                <th className={th}>Short</th>
                <th className={th}>Note</th>
              </tr>
            )}
            {kind === "rsi" && (
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>RSI</th>
                <th className={th}>Bear div</th>
                <th className={th}>Bull div</th>
                <th className={th}>Note</th>
              </tr>
            )}
            {kind === "fib" && (
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>Bias</th>
                <th className={th}>Impulse low</th>
                <th className={th}>Impulse high</th>
                <th className={th}>Fib 0.618</th>
                <th className={th}>Note</th>
              </tr>
            )}
            {kind === "htf" && (
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>Bars</th>
                <th className={th}>Zone points</th>
                <th className={th}>Note</th>
              </tr>
            )}
            {kind === "volume" && (
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>Rel vol</th>
                <th className={th}>Vol SMA</th>
                <th className={th}>Note</th>
              </tr>
            )}
          </thead>
          <tbody className="font-mono text-xs">
            {rows.map((row) => {
              if (!row.ok) {
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td
                      className={`${td} text-red-700 dark:text-red-300`}
                      colSpan={kind === "ema" ? 5 : kind === "fib" ? 5 : kind === "rsi" ? 4 : kind === "htf" ? 3 : 3}
                    >
                      {row.error}
                    </td>
                  </tr>
                );
              }
              const d = row.data as Record<string, unknown>;
              if (kind === "ema") {
                const latest = d.latest as {
                  last?: {
                    close?: number;
                    ema?: number | null;
                  };
                  longEntry?: boolean;
                  shortEntry?: boolean;
                };
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td className={td}>{fmtPrice(latest?.last?.close)}</td>
                    <td className={td}>{fmtPrice(latest?.last?.ema)}</td>
                    <td className={td}>{latest?.longEntry ? "yes" : "no"}</td>
                    <td className={td}>{latest?.shortEntry ? "yes" : "no"}</td>
                    <td className={`${td} text-zinc-500`}>—</td>
                  </tr>
                );
              }
              if (kind === "rsi") {
                const latest = d.latest as {
                  last?: RsiBarLite | null;
                  lastRsi?: number | null;
                };
                const last = latest?.last;
                const rsi =
                  last?.rsi ??
                  (typeof latest?.lastRsi === "number"
                    ? latest.lastRsi
                    : null);
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td className={td}>
                      {rsi != null ? rsi.toFixed(2) : "—"}
                    </td>
                    <td className={td}>
                      {last?.divergenceBearish ? "yes" : "no"}
                    </td>
                    <td className={td}>
                      {last?.divergenceBullish ? "yes" : "no"}
                    </td>
                    <td className={`${td} text-zinc-500`}>—</td>
                  </tr>
                );
              }
              if (kind === "fib") {
                const impulse = d.impulse as {
                  direction?: string;
                  impulseLow?: number;
                  impulseHigh?: number;
                } | null;
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td className={td}>{impulse?.direction ?? "—"}</td>
                    <td className={td}>{fmtPrice(impulse?.impulseLow)}</td>
                    <td className={td}>{fmtPrice(impulse?.impulseHigh)}</td>
                    <td className={td}>{fib618(row.data)}</td>
                    <td className={`${td} text-zinc-500`}>—</td>
                  </tr>
                );
              }
              if (kind === "htf") {
                const bars = d.bars as unknown[] | undefined;
                const zones = d.zones as unknown[] | undefined;
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td className={td}>{bars?.length ?? "—"}</td>
                    <td className={td}>{zones?.length ?? "—"}</td>
                    <td className={`${td} text-zinc-500`}>—</td>
                  </tr>
                );
              }
              if (kind === "volume") {
                const latest = d.latest as {
                  last?: {
                    relVol?: number | null;
                    volSma?: number | null;
                  };
                };
                const last = latest?.last;
                return (
                  <tr key={row.symbol}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.symbol}
                    </td>
                    <td className={td}>
                      {last?.relVol != null
                        ? `${last.relVol.toFixed(2)}×`
                        : "—"}
                    </td>
                    <td className={td}>
                      {last?.volSma != null ? last.volSma.toFixed(0) : "—"}
                    </td>
                    <td className={`${td} text-zinc-500`}>—</td>
                  </tr>
                );
              }
              return null;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SnapshotCards({
  kind,
  data,
}: {
  kind: StrategyKind;
  data: object;
}) {
  if (kind === "ema") {
    const d = data as {
      latest?: {
        last?: { ema?: number | null; close?: number };
        longEntry?: boolean;
        shortEntry?: boolean;
      };
      strategy?: { length?: number; confirmBars?: number };
      range_clamped?: boolean;
    };
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Snapshot summary
        </h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Last close</dt>
            <dd className="font-mono font-semibold">{fmtPrice(d.latest?.last?.close)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">EMA</dt>
            <dd className="font-mono font-semibold">{fmtPrice(d.latest?.last?.ema)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Long entry flag</dt>
            <dd>{d.latest?.longEntry ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Short entry flag</dt>
            <dd>{d.latest?.shortEntry ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Params</dt>
            <dd>
              length {d.strategy?.length ?? "—"}, confirm{" "}
              {d.strategy?.confirmBars ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Range</dt>
            <dd>{d.range_clamped ? "clamped to Kite max" : "as requested"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (kind === "rsi") {
    const d = data as {
      latest?: { lastRsi?: number | null; last?: RsiBarLite | null };
      strategy?: { period?: number };
      range_clamped?: boolean;
    };
    const last = d.latest?.last;
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Snapshot summary
        </h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">RSI</dt>
            <dd className="font-mono font-semibold">
              {last?.rsi != null ? last.rsi.toFixed(2) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Bearish div (last bar)</dt>
            <dd>{last?.divergenceBearish ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Bullish div (last bar)</dt>
            <dd>{last?.divergenceBullish ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Period</dt>
            <dd>{d.strategy?.period ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Range</dt>
            <dd>{d.range_clamped ? "clamped to Kite max" : "as requested"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (kind === "fib") {
    const d = data as {
      impulse?: {
        direction: string;
        impulseLow: number;
        impulseHigh: number;
      } | null;
      fib_levels?: { ratio: number; price: number }[];
    };
    const rows = d.fib_levels ?? [];
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Fib snapshot
        </h3>
        {d.impulse ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            Last impulse{" "}
            <strong className="font-medium">{d.impulse.direction}</strong> from{" "}
            {fmtPrice(d.impulse.impulseLow)} → {fmtPrice(d.impulse.impulseHigh)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No impulse detected from pivots.</p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                <th className="py-1">Ratio</th>
                <th className="py-1">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.ratio}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-1 font-mono">{r.ratio}</td>
                  <td className="py-1 font-mono">{fmtPrice(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (kind === "htf") {
    const d = data as {
      zones?: { time: string; source: string; price: number }[];
      bars?: unknown[];
    };
    const zones = (d.zones ?? []).slice(-16);
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          HTF zones (latest bars)
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Showing last {zones.length} O/H/L/C points from the response.
        </p>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-zinc-800 dark:text-zinc-200">
          {zones.map((z, i) => (
            <li key={`${z.time}-${z.source}-${i}`}>
              {z.time} · {z.source.toUpperCase()} · {fmtPrice(z.price)}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (kind === "volume") {
    const d = data as {
      latest?: {
        last?: {
          relVol?: number | null;
          volSma?: number | null;
          volume?: number;
        } | null;
      };
      strategy?: { smaLength?: number };
    };
    const last = d.latest?.last;
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Volume snapshot
        </h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Last volume</dt>
            <dd className="font-mono">{last?.volume ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Volume SMA</dt>
            <dd className="font-mono">
              {last?.volSma != null ? last.volSma.toFixed(0) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Relative volume</dt>
            <dd className="font-mono">
              {last?.relVol != null ? last.relVol.toFixed(2) + "×" : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">SMA length</dt>
            <dd>{d.strategy?.smaLength ?? "—"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (kind === "roundbottom") {
    const d = data as {
      universe_source?: string;
      summary?: { matches?: number; no_match?: number; errors?: number };
      universe?: { nse_eq?: number; bse_eq?: number; scanned?: number };
      nifty200_csv_rows?: number;
      throttle?: { spacing_ms?: number };
      hint?: string;
      error_breakdown?: Record<string, number>;
      top?: {
        instrument_key: string;
        score: {
          compositeScore: number;
          drawdownPct: number;
          baseBars: number;
          higherLowPivots: number;
          breakoutPct: number;
          volumeZ: number;
          neckline: number;
          breakoutClose: number;
        };
      }[];
    };
    const top = d.top ?? [];
    const breakdown = d.error_breakdown
      ? Object.entries(d.error_breakdown).sort((a, b) => b[1] - a[1])
      : [];
    const th =
      "border-b border-zinc-200 py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700";
    const td =
      "border-b border-zinc-100 py-2 pr-3 align-top tabular-nums dark:border-zinc-800";
    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Round bottom scan
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Source: {d.universe_source ?? "—"}
          {d.universe_source === "nifty200" && d.nifty200_csv_rows != null && (
            <span> · Nifty CSV rows {d.nifty200_csv_rows}</span>
          )}
          <br />
          Kite universe: NSE EQ {d.universe?.nse_eq ?? "—"} · BSE EQ {d.universe?.bse_eq ?? "—"} ·
          Scanned {d.universe?.scanned ?? "—"} · Matches {d.summary?.matches ?? "—"} · No match{" "}
          {d.summary?.no_match ?? "—"} · Errors {d.summary?.errors ?? "—"}
          {d.throttle?.spacing_ms != null && (
            <span>
              {" "}
              · Spacing {d.throttle.spacing_ms}ms
            </span>
          )}
        </p>
        {d.hint && (
          <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {d.hint}
          </p>
        )}
        {breakdown.length > 0 && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Error breakdown
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
              {breakdown.map(([msg, count]) => (
                <li key={msg}>
                  <span className="tabular-nums text-zinc-500">{count}×</span> {msg}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 max-h-[min(70vh,520px)] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-white dark:bg-zinc-950">
              <tr>
                <th className={th}>Symbol</th>
                <th className={th}>Score</th>
                <th className={th}>DD %</th>
                <th className={th}>Base bars</th>
                <th className={th}>HL pivots</th>
                <th className={th}>Breakout %</th>
                <th className={th}>Vol z</th>
                <th className={th}>Close</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {top.length === 0 ? (
                <tr>
                  <td className={td} colSpan={8}>
                    No matches in this window and subset.
                  </td>
                </tr>
              ) : (
                top.map((row) => (
                  <tr key={row.instrument_key}>
                    <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>
                      {row.instrument_key}
                    </td>
                    <td className={td}>{row.score.compositeScore.toFixed(1)}</td>
                    <td className={td}>
                      {(row.score.drawdownPct * 100).toFixed(1)}
                    </td>
                    <td className={td}>{row.score.baseBars}</td>
                    <td className={td}>{row.score.higherLowPivots}</td>
                    <td className={td}>
                      {(row.score.breakoutPct * 100).toFixed(2)}
                    </td>
                    <td className={td}>{row.score.volumeZ.toFixed(2)}</td>
                    <td className={td}>{fmtPrice(row.score.breakoutClose)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return null;
}
