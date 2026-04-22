"use client";

import type { ReactNode } from "react";

type JsonObj = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function fmtPrice(n: number | undefined, hint: number | undefined): string {
  if (n === undefined) return "—";
  const d = hint === 0 ? 0 : hint === 1 ? 1 : 2;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(d, 2),
    maximumFractionDigits: 4,
  });
}

function fmtInt(n: number | undefined): string {
  if (n === undefined) return "—";
  return Math.round(n).toLocaleString();
}

function fmtCompact(n: number | undefined): string {
  if (n === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number | undefined, multiply = false): string {
  if (n === undefined) return "—";
  const v = multiply ? n * 100 : n;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Yahoo returns either decimal (0.016) or whole-percent (1.62) depending on module */
function fmtMixedPct(n: number | undefined): string {
  if (n === undefined) return "—";
  const pct = Math.abs(n) < 1 && n !== 0 ? n * 100 : n;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

/** Dividend yield is usually already in “percent points” (e.g. 0.41 = 0.41%) */
function fmtYieldPts(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${n.toFixed(2)}%`;
}

function fmtDate(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

/** e.g. `strong_buy` → Strong buy */
function fmtRecommendationKey(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Text after "1.4 - Strong Buy" → sentiment for coloring */
function analystVerbalFromRating(s: string): string {
  const parts = s.split(/\s*-\s*/);
  return parts.length >= 2 ? parts.slice(1).join(" - ").trim() : s;
}

function analystRatingTextClass(verbal: string): string {
  const t = verbal.toLowerCase();
  if (t.includes("strong buy")) return "text-emerald-600 dark:text-emerald-400";
  if (t.includes("buy") && !t.includes("sell")) return "text-teal-600 dark:text-teal-400";
  if (t.includes("hold") || t.includes("neutral")) return "text-amber-600 dark:text-amber-400";
  if (t.includes("strong sell")) return "text-red-700 dark:text-red-400";
  if (t.includes("sell")) return "text-red-600 dark:text-red-400";
  if (t.includes("underperform")) return "text-orange-600 dark:text-orange-400";
  return "text-zinc-900 dark:text-zinc-100";
}

function recommendationKeyPillClass(key: string): string {
  const t = key.toLowerCase();
  if (t.includes("strong_buy") || t === "buy")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (t.includes("buy"))
    return "border-teal-500/40 bg-teal-500/10 text-teal-800 dark:border-teal-400/30 dark:bg-teal-950/50 dark:text-teal-200";
  if (t.includes("hold") || t.includes("neutral"))
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-200";
  if (t.includes("sell"))
    return "border-red-500/40 bg-red-500/10 text-red-800 dark:border-red-400/30 dark:bg-red-950/50 dark:text-red-200";
  return "border-teal-500/35 bg-teal-500/10 text-teal-800 dark:border-teal-400/25 dark:bg-teal-950/40 dark:text-teal-200";
}

function rangeObj(v: unknown): { low?: number; high?: number } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as JsonObj;
  return {
    low: num(o.low),
    high: num(o.high),
  };
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}

export function YahooFinanceQuoteView({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return (
      <p className="mt-4 text-sm text-zinc-500">No data to display.</p>
    );
  }

  const bundle = data as JsonObj;
  const quote = bundle.quote as JsonObj | undefined;
  const summary = bundle.summary as JsonObj | undefined;
  const profile = summary?.summaryProfile as JsonObj | undefined;
  const fin = summary?.financialData as JsonObj | undefined;
  const stats = summary?.defaultKeyStatistics as JsonObj | undefined;
  const priceBlock = summary?.price as JsonObj | undefined;

  const currency = str(quote?.currency) ?? str(priceBlock?.currency) ?? "";
  const sym = str(quote?.symbol) ?? str(priceBlock?.symbol) ?? "—";
  const longName = str(quote?.longName) ?? str(priceBlock?.longName);
  const shortName = str(quote?.shortName) ?? str(priceBlock?.shortName);
  const priceHint = num(quote?.priceHint) ?? num(priceBlock?.priceHint);
  const regPrice = num(quote?.regularMarketPrice) ?? num(priceBlock?.regularMarketPrice);
  const change = num(quote?.regularMarketChange) ?? num(priceBlock?.regularMarketChange);
  const changePct =
    num(quote?.regularMarketChangePercent) ?? num(priceBlock?.regularMarketChangePercent);
  const marketState = str(quote?.marketState) ?? str(priceBlock?.marketState);
  const exchange = str(quote?.fullExchangeName) ?? str(priceBlock?.exchangeName);
  const regTime = quote?.regularMarketTime ?? priceBlock?.regularMarketTime;

  const dayRange = rangeObj(quote?.regularMarketDayRange);
  const weekRange = rangeObj(quote?.fiftyTwoWeekRange);

  const deltaSigned =
    change ??
    (changePct !== undefined
      ? Math.abs(changePct) < 1 && changePct !== 0
        ? changePct * 100
        : changePct
      : undefined);
  const posChange =
    deltaSigned === undefined ? null : deltaSigned >= 0;

  const recommendationKey = str(fin?.recommendationKey);
  const averageAnalystRating = str(quote?.averageAnalystRating);
  const numberOfAnalystOpinions = num(fin?.numberOfAnalystOpinions);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-5 dark:border-zinc-700 dark:from-zinc-900/80 dark:to-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-teal-600 dark:text-teal-400">{sym}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {longName ?? shortName ?? sym}
            </h3>
            {shortName && longName && shortName !== longName ? (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{shortName}</p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              {exchange ? <span>{exchange}</span> : null}
              {recommendationKey ? (
                <span
                  className={`rounded-md border px-2 py-0.5 font-medium ${recommendationKeyPillClass(recommendationKey)}`}
                  aria-label={`Analyst recommendation: ${fmtRecommendationKey(recommendationKey)}`}
                >
                  {fmtRecommendationKey(recommendationKey)}
                </span>
              ) : null}
              {marketState ? (
                <span className="rounded-md bg-zinc-200/80 px-2 py-0.5 font-medium uppercase dark:bg-zinc-800">
                  {marketState}
                </span>
              ) : null}
              {regTime ? <span>As of {fmtDate(regTime)}</span> : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {currency ? `${currency} ` : null}
              {fmtPrice(regPrice, priceHint)}
            </p>
            <p
              className={`mt-1 text-sm font-medium tabular-nums ${
                posChange === null
                  ? "text-zinc-600 dark:text-zinc-400"
                  : posChange
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
              }`}
            >
              {change !== undefined ? `${change >= 0 ? "+" : ""}${fmtPrice(change, priceHint)}` : "—"}
              {changePct !== undefined ? ` (${fmtMixedPct(changePct)})` : null}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Session &amp; ranges
        </h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Previous close"
            value={`${currency ? `${currency} ` : ""}${fmtPrice(num(quote?.regularMarketPreviousClose), priceHint)}`}
          />
          <Stat
            label="Open"
            value={`${currency ? `${currency} ` : ""}${fmtPrice(num(quote?.regularMarketOpen), priceHint)}`}
          />
          <Stat
            label="Day range"
            value={
              dayRange?.low !== undefined && dayRange?.high !== undefined
                ? `${fmtPrice(dayRange.low, priceHint)} – ${fmtPrice(dayRange.high, priceHint)}`
                : "—"
            }
          />
          <Stat
            label="Volume"
            value={fmtInt(num(quote?.regularMarketVolume) ?? num(priceBlock?.regularMarketVolume))}
          />
          <Stat
            label="52-week range"
            value={
              weekRange?.low !== undefined && weekRange?.high !== undefined
                ? `${fmtPrice(weekRange.low, priceHint)} – ${fmtPrice(weekRange.high, priceHint)}`
                : "—"
            }
          />
          <Stat label="Market cap" value={fmtCompact(num(quote?.marketCap) ?? num(priceBlock?.marketCap))} />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Valuation &amp; ratios
        </h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Trailing P/E" value={fmtPrice(num(quote?.trailingPE), 2)} />
          <Stat label="Forward P/E" value={fmtPrice(num(quote?.forwardPE), 2)} />
          <Stat label="Price / book" value={fmtPrice(num(quote?.priceToBook), 2)} />
          <Stat label="EPS (TTM)" value={fmtPrice(num(quote?.epsTrailingTwelveMonths), 2)} />
          <Stat label="Dividend yield" value={fmtYieldPts(num(quote?.dividendYield))} />
          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Analyst rating
            </p>
            {averageAnalystRating ? (
              <>
                <p
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${analystRatingTextClass(analystVerbalFromRating(averageAnalystRating))}`}
                >
                  {averageAnalystRating}
                </p>
                {numberOfAnalystOpinions !== undefined ? (
                  <p className="mt-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {fmtInt(numberOfAnalystOpinions)} analysts
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">—</p>
            )}
          </div>
        </div>
      </div>

      {fin ? (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Financials (snapshot)
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Revenue growth"
              value={fmtPct(num(fin.revenueGrowth), true)}
            />
            <Stat
              label="Profit margin"
              value={fmtPct(num(fin.profitMargins), true)}
            />
            <Stat
              label="Gross margin"
              value={fmtPct(num(fin.grossMargins), true)}
            />
            <Stat
              label="Operating margin"
              value={fmtPct(num(fin.operatingMargins), true)}
            />
            <Stat
              label="EBITDA margin"
              value={fmtPct(num(fin.ebitdaMargins), true)}
            />
            <Stat label="Debt / equity" value={fmtPrice(num(fin.debtToEquity), 2)} />
            <Stat
              label="Analyst target (mean)"
              value={`${str(fin.financialCurrency) ?? currency} ${fmtPrice(num(fin.targetMeanPrice), priceHint)}`}
            />
            <Stat
              label="Target range"
              value={
                num(fin.targetLowPrice) !== undefined && num(fin.targetHighPrice) !== undefined
                  ? `${fmtPrice(num(fin.targetLowPrice), priceHint)} – ${fmtPrice(num(fin.targetHighPrice), priceHint)}`
                  : "—"
              }
            />
          </div>
        </div>
      ) : null}

      {profile ? (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Company
          </h4>
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Sector" value={str(profile.sectorDisp) ?? str(profile.sector) ?? "—"} />
              <Stat label="Industry" value={str(profile.industryDisp) ?? str(profile.industry) ?? "—"} />
              <Stat
                label="Employees"
                value={fmtInt(num(profile.fullTimeEmployees))}
              />
              <Stat
                label="Website"
                value={
                  str(profile.website) ? (
                    <a
                      href={str(profile.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
                    >
                      {str(profile.website)?.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
            {str(profile.longBusinessSummary) ? (
              <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {str(profile.longBusinessSummary)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {stats ? (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Key statistics
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Beta" value={fmtPrice(num(stats.beta), 2)} />
            <Stat label="Book value" value={fmtPrice(num(stats.bookValue), 2)} />
            <Stat
              label="52-week price change"
              value={fmtPct(num(stats["52WeekChange"]), true)}
            />
            <Stat
              label="Forward EPS"
              value={fmtPrice(num(stats.forwardEps), 2)}
            />
            <Stat
              label="PEG ratio"
              value={fmtPrice(num(stats.pegRatio), 2)}
            />
            <Stat
              label="Enterprise value"
              value={fmtCompact(num(stats.enterpriseValue))}
            />
          </div>
        </div>
      ) : null}

      <details className="rounded-lg border border-dashed border-zinc-200 p-3 text-sm dark:border-zinc-700">
        <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-400">
          Raw JSON
        </summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
