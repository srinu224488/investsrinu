import { NextRequest, NextResponse } from "next/server";
import { fetchKiteHistoricalOhlcWithRetry } from "@/lib/kite-historical";
import { fetchKiteEqInstruments, type KiteEqInstrument } from "@/lib/kite-instruments";
import { getKiteAccessToken } from "@/lib/kite-session";
import {
  getKiteAccessTokenForWebhook,
  persistKiteAccessTokenForWebhook,
} from "@/lib/kite-webhook-access-token";
import {
  fetchNifty200SymbolList,
  matchNifty200ToKiteInstruments,
} from "@/lib/nifty200-constituents";
import {
  DEFAULT_ROUND_BOTTOM_PARAMS,
  type RoundBottomScanParams,
  scoreRoundBottom,
} from "@/lib/round-bottom-scan";

export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorBucket(message: string): string {
  const t = message.trim();
  if (t.startsWith("too_few_bars")) {
    return "too_few_bars (<60 daily candles in range)";
  }
  if (t === "no_match") return "no_match";
  const s = t.slice(0, 120);
  return s.length <= 80 ? s : `${s.slice(0, 77)}…`;
}

type ScanOneResult =
  | {
      ok: true;
      instrument: KiteEqInstrument;
      score: NonNullable<ReturnType<typeof scoreRoundBottom>>;
    }
  | { ok: false; instrument: KiteEqInstrument; error: string };

/**
 * GET /api/kite/round-bottom-scan — scan NSE/BSE EQ universe (subset) for round-bottom breakout heuristic.
 *
 * Query: `universe` — `nifty200` (default): CNX Nifty 200 from NSE CSV matched to Kite NSE EQ; `eq_alpha`: merged NSE/BSE EQ sorted A–Z.
 * `exchanges` applies only to `eq_alpha`. `max_symbols` caps how many names are scanned (Nifty order preserved).
 * Full scan also needs `from`, `to` (IST), `top_n`, `spacing_ms`, etc.
 * Set `preview=1` to return the resolved list only (no OHLC, no `from`/`to` required).
 */
export async function GET(req: NextRequest) {
  const accessToken =
    (await getKiteAccessToken()) ?? (await getKiteAccessTokenForWebhook());
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const previewOnly =
    sp.get("preview") === "1" || sp.get("preview") === "true";

  let from = sp.get("from")?.trim();
  let to = sp.get("to")?.trim();
  if (!previewOnly && (!from || !to)) {
    return NextResponse.json({ error: "from_to_required" }, { status: 400 });
  }

  const universeMode = (sp.get("universe") ?? "nifty200").toLowerCase();
  const useNifty200 =
    universeMode === "nifty200" || universeMode === "cnx200";

  let wantNse = false;
  let wantBse = false;
  if (!useNifty200) {
    const exRaw = (sp.get("exchanges") ?? "nse,bse").toLowerCase();
    wantNse = exRaw.includes("nse");
    wantBse = exRaw.includes("bse");
    if (!wantNse && !wantBse) {
      return NextResponse.json({ error: "exchanges_invalid" }, { status: 400 });
    }
  }

  const maxSymbols = Math.min(
    500,
    Math.max(10, Math.floor(Number(sp.get("max_symbols") ?? 120) || 120)),
  );
  const topN = Math.min(100, Math.max(1, Math.floor(Number(sp.get("top_n") ?? 50) || 50)));
  const spacingMs = Math.min(
    3000,
    Math.max(0, Math.floor(Number(sp.get("spacing_ms") ?? 400) || 400)),
  );

  const ddRaw = sp.get("min_drawdown_pct")?.trim();
  let minDrawdownPct = DEFAULT_ROUND_BOTTOM_PARAMS.minDrawdownPct;
  if (ddRaw) {
    const v = Number(ddRaw);
    if (Number.isFinite(v)) {
      const frac = v > 1 ? v / 100 : v;
      minDrawdownPct = Math.min(0.55, Math.max(0.02, frac));
    }
  }

  const params: RoundBottomScanParams = {
    pivotLeft: Math.min(
      8,
      Math.max(1, Math.floor(Number(sp.get("pivot_left") ?? DEFAULT_ROUND_BOTTOM_PARAMS.pivotLeft) || 3)),
    ),
    pivotRight: Math.min(
      8,
      Math.max(1, Math.floor(Number(sp.get("pivot_right") ?? DEFAULT_ROUND_BOTTOM_PARAMS.pivotRight) || 3)),
    ),
    troughLookbackBars: Math.min(
      260,
      Math.max(
        40,
        Math.floor(
          Number(sp.get("trough_lookback_bars") ?? DEFAULT_ROUND_BOTTOM_PARAMS.troughLookbackBars) ||
            DEFAULT_ROUND_BOTTOM_PARAMS.troughLookbackBars,
        ),
      ),
    ),
    minBaseBars: Math.min(
      80,
      Math.max(
        8,
        Math.floor(
          Number(sp.get("min_base_bars") ?? DEFAULT_ROUND_BOTTOM_PARAMS.minBaseBars) ||
            DEFAULT_ROUND_BOTTOM_PARAMS.minBaseBars,
        ),
      ),
    ),
    minDrawdownPct,
    minHigherLowPivots: Math.min(
      6,
      Math.max(
        1,
        Math.floor(
          Number(sp.get("min_higher_low_pivots") ?? DEFAULT_ROUND_BOTTOM_PARAMS.minHigherLowPivots) ||
            DEFAULT_ROUND_BOTTOM_PARAMS.minHigherLowPivots,
        ),
      ),
    ),
    volLookback: Math.min(
      120,
      Math.max(
        15,
        Math.floor(
          Number(sp.get("vol_lookback") ?? DEFAULT_ROUND_BOTTOM_PARAMS.volLookback) ||
            DEFAULT_ROUND_BOTTOM_PARAMS.volLookback,
        ),
      ),
    ),
  };

  try {
    let nseEq = 0;
    let bseEq = 0;
    let universe: KiteEqInstrument[] = [];
    let nifty200IndexRows = 0;
    let unmatchedNifty: string[] = [];

    if (useNifty200) {
      const niftySymbols = await fetchNifty200SymbolList();
      nifty200IndexRows = niftySymbols.length;
      const nseList = await fetchKiteEqInstruments(accessToken, "NSE");
      nseEq = nseList.length;
      const m = matchNifty200ToKiteInstruments(niftySymbols, nseList, maxSymbols);
      universe = m.universe;
      unmatchedNifty = m.unmatched;
    } else {
      const instLists: KiteEqInstrument[] = [];
      if (wantNse) {
        const nse = await fetchKiteEqInstruments(accessToken, "NSE");
        nseEq = nse.length;
        instLists.push(...nse);
      }
      if (wantBse) {
        const bse = await fetchKiteEqInstruments(accessToken, "BSE");
        bseEq = bse.length;
        instLists.push(...bse);
      }
      instLists.sort((a, b) =>
        a.tradingsymbol.localeCompare(b.tradingsymbol, "en"),
      );
      universe = instLists.slice(0, maxSymbols);
    }

    void persistKiteAccessTokenForWebhook(accessToken);

    const universeSource = useNifty200 ? "nifty200" : "eq_alpha";
    const exchangeFlags = useNifty200
      ? { nse: true, bse: false }
      : { nse: wantNse, bse: wantBse };

    if (previewOnly) {
      return NextResponse.json({
        preview: true,
        universe_source: universeSource,
        exchanges: exchangeFlags,
        universe: {
          nse_eq: nseEq,
          bse_eq: bseEq,
          scanned: universe.length,
          max_symbols: maxSymbols,
          nifty200_csv_rows: useNifty200 ? nifty200IndexRows : undefined,
          unmatched_after_cap: useNifty200 ? unmatchedNifty.length : undefined,
        },
        unmatched_nifty_symbols_sample: useNifty200
          ? unmatchedNifty.slice(0, 25)
          : undefined,
        symbols: universe.map((u) => ({
          instrument_key: u.instrumentKey,
          exchange: u.exchange,
          tradingsymbol: u.tradingsymbol,
          instrument_token: u.instrument_token,
        })),
      });
    }

    const rows: ScanOneResult[] = [];
    for (let i = 0; i < universe.length; i++) {
      if (i > 0 && spacingMs > 0) await sleep(spacingMs);
      const inst = universe[i]!;
      try {
        const bars = await fetchKiteHistoricalOhlcWithRetry(
          accessToken,
          inst.instrument_token,
          "day",
          from!,
          to!,
          { maxRetries: 4, baseDelayMs: 900 },
        );
        if (bars.length < 60) {
          rows.push({
            ok: false,
            instrument: inst,
            error: `too_few_bars (${bars.length}; need ~60+ trading days in range)`,
          });
          continue;
        }
        const score = scoreRoundBottom(bars, params);
        if (!score) {
          rows.push({
            ok: false,
            instrument: inst,
            error: "no_match",
          });
          continue;
        }
        rows.push({ ok: true, instrument: inst, score });
      } catch (e) {
        const message = e instanceof Error ? e.message : "fetch_failed";
        rows.push({
          ok: false,
          instrument: inst,
          error: message,
        });
      }
    }

    const matches = rows.filter(
      (r): r is Extract<ScanOneResult, { ok: true }> => r.ok,
    );
    matches.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
    const top = matches.slice(0, topN).map((m) => ({
      instrument_key: m.instrument.instrumentKey,
      exchange: m.instrument.exchange,
      tradingsymbol: m.instrument.tradingsymbol,
      instrument_token: m.instrument.instrument_token,
      score: m.score,
    }));

    const fetchErrors = rows.filter(
      (r): r is Extract<ScanOneResult, { ok: false }> =>
        !r.ok && r.error !== "no_match",
    );
    const errorSample = fetchErrors.slice(0, 60).map((r) => ({
      instrument_key: r.instrument.instrumentKey,
      error: r.error,
    }));

    const errorBreakdown: Record<string, number> = {};
    for (const r of fetchErrors) {
      const k = errorBucket(r.error);
      errorBreakdown[k] = (errorBreakdown[k] ?? 0) + 1;
    }

    return NextResponse.json({
      interval: "day",
      from,
      to,
      universe_source: universeSource,
      exchanges: exchangeFlags,
      nifty200_csv_rows: useNifty200 ? nifty200IndexRows : undefined,
      unmatched_nifty_symbols_sample: useNifty200
        ? unmatchedNifty.slice(0, 25)
        : undefined,
      params,
      throttle: { spacing_ms: spacingMs, sequential: true },
      universe: {
        nse_eq: nseEq,
        bse_eq: bseEq,
        scanned: universe.length,
      },
      summary: {
        matches: matches.length,
        no_match: rows.filter((r) => !r.ok && r.error === "no_match").length,
        errors: fetchErrors.length,
      },
      error_breakdown: errorBreakdown,
      hint:
        Object.keys(errorBreakdown).some((k) => /too many|429|rate/i.test(k))
          ? "Kite historical API is rate-limited (~3 req/s). This scan spaces requests; if errors persist, increase spacing_ms (e.g. 600–800) or reduce max_symbols."
          : Object.keys(errorBreakdown).some((k) => k.startsWith("too_few_bars"))
            ? "Many symbols had fewer than 60 daily candles — widen From/To (about 6+ months calendar time usually suffices)."
            : undefined,
      top,
      errors: errorSample,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "round_bottom_scan_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
