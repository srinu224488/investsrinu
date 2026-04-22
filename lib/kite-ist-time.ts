/** Format a Date as `yyyy-mm-dd hh:mm:ss` in Asia/Kolkata (Kite cash-market convention). */
export function formatKiteIst(d: Date): string {
  return d
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace("T", " ");
}

/**
 * Parse Kite / UI datetimes for comparisons. Kite candles may be `yyyy-mm-dd hh:mm:ss`,
 * ISO with `+05:30`, or with milliseconds — the previous strict parser returned NaN for those
 * and dropped every bar from the visible window (`no_historical_bars`).
 */
export function parseKiteIstString(s: string): Date {
  const raw = s.trim();
  if (!raw) return new Date(NaN);

  const hasTz =
    /[+-]\d{2}:?\d{2}\s*$/i.test(raw) ||
    /[+-]\d{4}\s*$/i.test(raw) ||
    /Z\s*$/i.test(raw);
  if (hasTz || (raw.includes("T") && /[zZ]|[+-]\d/.test(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
  }

  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})(?:\.\d+)?/,
  );
  if (m) {
    return new Date(`${m[1]}T${m[2]}+05:30`);
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
}

/** `yyyy-mm-dd hh:mm:ss` / `yyyy-mm-ddThh:mm:ss` for lexicographic range checks when needed. */
function normalizeKiteTimeKey(s: string): string {
  const raw = s.trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw.slice(0, 19);
}

/**
 * Kite historical API rejects very wide intraday windows. Shrink `from` toward `to` when needed.
 * `day` interval is not clamped.
 */
export function clampIntradayHistoricalWindow(
  interval: string,
  fromStr: string,
  toStr: string,
): { from: string; to: string; clamped: boolean } {
  if (interval === "day") {
    return { from: fromStr, to: toStr, clamped: false };
  }
  const maxDays = MAX_INTRADAY_HISTORICAL_DAYS[interval] ?? 14;
  const to = parseKiteIstString(toStr);
  const from = parseKiteIstString(fromStr);
  if (Number.isNaN(+to) || Number.isNaN(+from)) {
    return { from: fromStr, to: toStr, clamped: false };
  }
  const spanMs = to.getTime() - from.getTime();
  const maxMs = maxDays * 86_400_000;
  if (spanMs <= maxMs) {
    return { from: fromStr, to: toStr, clamped: false };
  }
  const from2 = new Date(to.getTime() - maxMs);
  return {
    from: formatKiteIst(from2),
    to: toStr,
    clamped: true,
  };
}

/** Approximate ms per bar for extending `from` backward (warmup); intraday uses extra margin for session gaps. */
const INTERVAL_MS: Record<string, number> = {
  minute: 60_000,
  "3minute": 180_000,
  "5minute": 300_000,
  "10minute": 600_000,
  "15minute": 900_000,
  "30minute": 1_800_000,
  "60minute": 3_600_000,
  day: 86_400_000,
};

/**
 * Move `from` earlier by roughly `extraBars` of candle duration (for indicator warmup).
 * Uses the same spacing heuristic as MA-cross warmup (gap multiplier for intraday gaps).
 */
export function extendIstFromForWarmupBars(
  fromStr: string,
  interval: string,
  extraBars: number,
): string {
  const from = parseKiteIstString(fromStr);
  if (Number.isNaN(+from)) return fromStr;
  const bars = Math.max(0, Math.floor(extraBars));
  const perBar = INTERVAL_MS[interval] ?? 60_000;
  const gapMul = interval === "day" ? 1 : 2.5;
  const msBack = bars * perBar * gapMul;
  return formatKiteIst(new Date(from.getTime() - msBack));
}

/**
 * Move `from` earlier so SMA(length) and confirm counts match TradingView, which uses all
 * bars before the visible window — not just bars inside [from, to].
 */
export function extendIstFromForMaWarmup(
  fromStr: string,
  interval: string,
  length: number,
  confirmBars: number,
): string {
  const extraBars = Math.max(0, length - 1) + confirmBars + 20;
  return extendIstFromForWarmupBars(fromStr, interval, extraBars);
}

/** Bar indices with `time` in [fromStr, toStr] (IST), inclusive. */
export function barIndicesInIstRange(
  times: string[],
  fromStr: string,
  toStr: string,
): number[] {
  const t0 = parseKiteIstString(fromStr).getTime();
  const t1 = parseKiteIstString(toStr).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) return [];

  const out: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = parseKiteIstString(times[i]!).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= t0 && t <= t1) out.push(i);
  }
  if (out.length > 0) return out;

  const fKey = normalizeKiteTimeKey(fromStr);
  const tKey = normalizeKiteTimeKey(toStr);
  for (let i = 0; i < times.length; i++) {
    const k = normalizeKiteTimeKey(times[i]!);
    if (k >= fKey && k <= tKey) out.push(i);
  }
  return out;
}

/** Conservative caps so Kite GET /instruments/historical succeeds for intraday intervals. */
const MAX_INTRADAY_HISTORICAL_DAYS: Record<string, number> = {
  minute: 5,
  "3minute": 21,
  "5minute": 45,
  "10minute": 70,
  "15minute": 90,
  "30minute": 120,
  "60minute": 180,
};

export function defaultHistoricalIstRangeForInterval(
  interval: string,
): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime());
  const days =
    interval === "day"
      ? 730
      : interval === "60minute" || interval === "30minute"
        ? 120
        : 14;
  from.setDate(from.getDate() - days);
  return {
    from: formatKiteIst(from),
    to: formatKiteIst(to),
  };
}
