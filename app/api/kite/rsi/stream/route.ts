import { NextRequest } from "next/server";
import WebSocket from "ws";
import {
  fetchKiteInstrumentTokenForKey,
  normalizeKiteInstrumentKey,
  type KiteHistoricalInterval,
} from "@/lib/kite-historical";
import {
  clampIntradayHistoricalWindow,
  defaultHistoricalIstRangeForInterval,
} from "@/lib/kite-ist-time";
import { applyLtpToLastBar } from "@/lib/kite-live-last-bar";
import { kiteRsiFromOhlc } from "@/lib/kite-rsi-ohlc";
import { rsiWithDivergenceSeries } from "@/lib/rsi-strategy";
import { getKiteAccessToken } from "@/lib/kite-session";
import {
  getKiteAccessTokenForWebhook,
  persistKiteAccessTokenForWebhook,
} from "@/lib/kite-webhook-access-token";
import { kiteTickRawToInr, parseKiteTickerBinaryTicks } from "@/lib/kite-ws-binary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS = new Set<string>([
  "minute",
  "day",
  "3minute",
  "5minute",
  "10minute",
  "15minute",
  "30minute",
  "60minute",
]);

const KITE_WS = "wss://ws.kite.trade";

/**
 * GET /api/kite/rsi/stream — SSE: LTP merged into last candle OHLC; RSI + divergence on latest bar.
 */
export async function GET(req: NextRequest) {
  const accessToken =
    (await getKiteAccessToken()) ?? (await getKiteAccessTokenForWebhook());
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "not_connected" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.KITE_API_KEY?.trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "KITE_API_KEY is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = req.nextUrl.searchParams;
  const symbolRaw = sp.get("symbol")?.trim();
  if (!symbolRaw) {
    return new Response(JSON.stringify({ error: "symbol_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const intervalRaw = sp.get("interval")?.trim() || "day";
  if (!INTERVALS.has(intervalRaw)) {
    return new Response(JSON.stringify({ error: "invalid_interval" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const interval = intervalRaw as KiteHistoricalInterval;

  const period = Math.min(
    100,
    Math.max(2, Math.floor(Number(sp.get("period") ?? 14) || 14)),
  );
  const pivotLeft = Math.min(
    10,
    Math.max(1, Math.floor(Number(sp.get("pivot_left") ?? 2) || 2)),
  );
  const pivotRight = Math.min(
    10,
    Math.max(1, Math.floor(Number(sp.get("pivot_right") ?? 2) || 2)),
  );

  let userFrom = sp.get("from")?.trim();
  let userTo = sp.get("to")?.trim();
  if (!userFrom || !userTo) {
    const d = defaultHistoricalIstRangeForInterval(intervalRaw);
    userFrom = d.from;
    userTo = d.to;
  }
  const range = clampIntradayHistoricalWindow(intervalRaw, userFrom, userTo);
  const displayFrom = range.from;
  const displayTo = range.to;

  const symbol = normalizeKiteInstrumentKey(symbolRaw);
  const strategy = { period, pivotLeft, pivotRight };

  let instrumentToken: number;
  let closesFull: number[];
  let highsFull: number[];
  let lowsFull: number[];
  let baseLast: ReturnType<typeof rsiWithDivergenceSeries>[number] | null;
  let visibleBars: number;

  try {
    instrumentToken = await fetchKiteInstrumentTokenForKey(accessToken, symbolRaw);
    void persistKiteAccessTokenForWebhook(accessToken);
    const result = await kiteRsiFromOhlc(accessToken, {
      instrumentToken,
      interval,
      from: displayFrom,
      to: displayTo,
      symbol: symbolRaw,
      strategy,
    });
    if (!result.bars.length) {
      const error =
        result.closesFull.length === 0
          ? "kite_returned_no_candles"
          : "no_bars_in_requested_range";
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    closesFull = result.closesFull;
    highsFull = result.highsFull;
    lowsFull = result.lowsFull;
    const series0 = rsiWithDivergenceSeries(closesFull, highsFull, lowsFull, strategy);
    baseLast = series0.length ? series0[series0.length - 1]! : null;
    visibleBars = result.bars.length;
  } catch (e) {
    const message = e instanceof Error ? e.message : "historical_failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      send({
        type: "ready",
        symbol,
        instrument_token: instrumentToken,
        interval,
        from: displayFrom,
        to: displayTo,
        range_clamped: range.clamped,
        strategy,
        bars: visibleBars,
        latest: baseLast,
      });

      const wsUrl = `${KITE_WS}?api_key=${encodeURIComponent(apiKey)}&access_token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 20000);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(ping);
        try {
          ws.removeAllListeners();
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      function rawToBuffer(raw: WebSocket.RawData): Buffer {
        if (Buffer.isBuffer(raw)) return raw;
        if (raw instanceof ArrayBuffer) return Buffer.from(raw);
        if (Array.isArray(raw)) return Buffer.concat(raw);
        return Buffer.from(raw);
      }

      const tokenU = instrumentToken >>> 0;

      ws.on("open", () => {
        ws.send(JSON.stringify({ a: "subscribe", v: [instrumentToken] }));
        ws.send(JSON.stringify({ a: "mode", v: ["ltp", [instrumentToken]] }));
      });

      ws.on("message", (raw) => {
        const buf = rawToBuffer(raw);
        const ticks = parseKiteTickerBinaryTicks(buf);
        for (const t of ticks) {
          if ((t.instrumentToken >>> 0) !== tokenU) continue;
          const ltp = kiteTickRawToInr(t.lastPriceRaw, t.instrumentToken);
          const hi = highsFull.slice();
          const lo = lowsFull.slice();
          const cl = closesFull.slice();
          applyLtpToLastBar(hi, lo, cl, ltp);
          const series = rsiWithDivergenceSeries(cl, hi, lo, strategy);
          const last = series.length ? series[series.length - 1]! : null;
          send({
            type: "tick",
            ltp,
            latest: last,
            at: Date.now(),
          });
        }
      });

      ws.on("error", (err) => {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "websocket_error",
        });
        cleanup();
      });

      ws.on("close", () => {
        if (!cleaned) send({ type: "closed" });
        cleanup();
      });

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
