"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { YahooFinanceQuoteView } from "./YahooFinanceQuoteView";

type SearchQuote = {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
};

export function YahooFinanceSection() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchQuote[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/yfinance/search?q=${encodeURIComponent(q)}`);
      const j = (await r.json()) as { quotes?: SearchQuote[]; error?: string };
      if (!r.ok) {
        setSearchHits([]);
        return;
      }
      setSearchHits(j.quotes ?? []);
    } catch {
      setSearchHits([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function onSymbolChange(value: string) {
    setSymbol(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 320);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setListOpen(false);
    setLoading(true);
    setErr(null);
    setResult(null);
    void (async () => {
      try {
        const r = await fetch(
          `/api/yfinance?symbol=${encodeURIComponent(symbol.trim())}`,
        );
        const j = await r.json();
        if (!r.ok) {
          setErr((j as { error?: string }).error || "request failed");
          return;
        }
        setResult(j);
      } catch (caught) {
        setErr(caught instanceof Error ? caught.message : "error");
      } finally {
        setLoading(false);
      }
    })();
  }

  function pickHit(hit: SearchQuote) {
    setSymbol(hit.symbol);
    setSearchHits([]);
    setListOpen(false);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Yahoo Finance
      </h2>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={onSubmit}
      >
        <div className="relative flex-1">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Symbol{" "}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">
                (type to search)
              </span>
            </span>
            <input
              name="symbol"
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              onFocus={() => setListOpen(true)}
              onBlur={() => {
                blurTimeoutRef.current = setTimeout(() => setListOpen(false), 180);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search symbols or company names…"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
              aria-autocomplete="list"
              aria-expanded={listOpen && (searchHits.length > 0 || searchLoading)}
              aria-controls="yfinance-symbol-suggestions"
            />
          </label>
          {listOpen && (searchHits.length > 0 || searchLoading) ? (
            <ul
              id="yfinance-symbol-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
            >
              {searchLoading && searchHits.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">Searching…</li>
              ) : null}
              {searchHits.map((hit) => {
                const title = hit.shortname ?? hit.longname ?? hit.symbol;
                const sub = [hit.exchange, hit.quoteType].filter(Boolean).join(" · ");
                return (
                  <li key={`${hit.symbol}-${title}`} role="option">
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickHit(hit)}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {hit.symbol}
                      </span>
                      <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {title}
                        {sub ? ` · ${sub}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </form>
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      {result ? <YahooFinanceQuoteView data={result} /> : null}
    </section>
  );
}
