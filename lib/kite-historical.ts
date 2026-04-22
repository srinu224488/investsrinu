import { kiteGet } from "./kite-client";

/** Kite Connect v3 historical intervals. */
export type KiteHistoricalInterval =
  | "minute"
  | "day"
  | "3minute"
  | "5minute"
  | "10minute"
  | "15minute"
  | "30minute"
  | "60minute";

export type KiteOhlcBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
};

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Parse one Kite historical row: [timestamp, open, high, low, close, volume, oi?]. */
export function parseKiteHistoricalRow(row: unknown): KiteOhlcBar | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const t = row[0];
  const o = num(row[1]);
  const h = num(row[2]);
  const l = num(row[3]);
  const c = num(row[4]);
  const v = num(row[5]);
  if (typeof t !== "string" || o === null || h === null || l === null || c === null || v === null) {
    return null;
  }
  const oi = row.length >= 7 ? num(row[6]) : undefined;
  return { time: t, open: o, high: h, low: l, close: c, volume: v, oi: oi ?? undefined };
}

export type FetchKiteHistoricalOptions = {
  continuous?: 0 | 1;
  oi?: 0 | 1;
};

/** `MCX:CRUDEOILM26APRFUT` or bare `RELIANCE` (defaults exchange to NSE). */
export function normalizeKiteInstrumentKey(symbol: string): string {
  const t = symbol.trim();
  if (!t) throw new Error("Empty symbol");
  if (t.includes(":")) return t;
  return `NSE:${t.toUpperCase()}`;
}

/**
 * Resolve `exchange:tradingsymbol` to `instrument_token` via GET /quote/ltp (Kite Connect v3).
 */
export async function fetchKiteInstrumentTokenForKey(
  accessToken: string,
  symbol: string,
): Promise<number> {
  const key = normalizeKiteInstrumentKey(symbol);
  const path = `/quote/ltp?i=${encodeURIComponent(key)}`;
  const data = await kiteGet<Record<string, { instrument_token?: number }>>(path, accessToken);
  const row = data[key];
  const token = row?.instrument_token;
  if (typeof token !== "number" || !Number.isFinite(token)) {
    throw new Error(`No instrument_token in LTP response for ${key}`);
  }
  return token;
}

/**
 * OHLC candles from Kite GET /instruments/historical/:instrument_token/:interval
 * (`from` / `to` as yyyy-mm-dd hh:mm:ss, IST for cash markets).
 */
export async function fetchKiteHistoricalOhlc(
  accessToken: string,
  instrumentToken: number | string,
  interval: KiteHistoricalInterval,
  from: string,
  to: string,
  opts?: FetchKiteHistoricalOptions,
): Promise<KiteOhlcBar[]> {
  const q = new URLSearchParams({ from, to });
  if (opts?.continuous === 1) q.set("continuous", "1");
  if (opts?.oi === 1) q.set("oi", "1");
  const path = `/instruments/historical/${instrumentToken}/${interval}?${q.toString()}`;
  const data = await kiteGet<{ candles?: unknown[] }>(path, accessToken);
  const raw = data.candles;
  if (!Array.isArray(raw)) return [];
  const out: KiteOhlcBar[] = [];
  for (const row of raw) {
    const bar = parseKiteHistoricalRow(row);
    if (bar) out.push(bar);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type FetchKiteHistoricalRetryOpts = FetchKiteHistoricalOptions & {
  /** Extra attempts after the first failure (default 4). */
  maxRetries?: number;
  /** Base delay before first retry, doubles each attempt (default 800ms). */
  baseDelayMs?: number;
};

/**
 * Same as {@link fetchKiteHistoricalOhlc} but retries on rate limits and transient failures.
 */
export async function fetchKiteHistoricalOhlcWithRetry(
  accessToken: string,
  instrumentToken: number | string,
  interval: KiteHistoricalInterval,
  from: string,
  to: string,
  opts?: FetchKiteHistoricalRetryOpts,
): Promise<KiteOhlcBar[]> {
  const maxRetries = Math.min(8, Math.max(0, Math.floor(opts?.maxRetries ?? 4)));
  const baseDelayMs = Math.min(15_000, Math.max(100, Math.floor(opts?.baseDelayMs ?? 800)));
  const kiteOpts: FetchKiteHistoricalOptions | undefined =
    opts?.continuous !== undefined || opts?.oi !== undefined
      ? { continuous: opts.continuous, oi: opts.oi }
      : undefined;

  let last: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchKiteHistoricalOhlc(
        accessToken,
        instrumentToken,
        interval,
        from,
        to,
        kiteOpts,
      );
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /too many|rate|429|timeout|network|ECONNRESET|socket|503|502|temporar|busy/i.test(
        msg,
      );
      if (!retryable || attempt === maxRetries) throw e;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw last;
}
