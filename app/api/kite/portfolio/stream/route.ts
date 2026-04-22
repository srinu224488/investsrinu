import { NextRequest } from "next/server";
import WebSocket from "ws";
import { kiteGet } from "@/lib/kite-client";
import {
  applyLtpTick,
  clonePortfolioFromRest,
  instrumentTokensFromSnapshot,
  type MutablePortfolioSnapshot,
} from "@/lib/kite-portfolio-live-ltp";
import { persistKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import { getKiteAccessToken } from "@/lib/kite-session";
import { kiteTickRawToInr, parseKiteTickerBinaryTicks } from "@/lib/kite-ws-binary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionsBody = { net?: unknown[]; day?: unknown[] };

const KITE_WS = "wss://ws.kite.trade";

const TICK_FLUSH_MS = 200;
const ORDER_REST_DEBOUNCE_MS = 450;

/**
 * GET /api/kite/portfolio/stream — Server-Sent Events with live LTP from Kite WebSocket
 * (https://kite.trade/docs/connect/v3/websocket/) merged into REST snapshots, periodic REST
 * reconciliation, and full REST refresh on `order` postbacks (same WS channel).
 *
 * Query: `interval_ms` (2000–30000, default 5000) between REST polls.
 *
 * Auth: Kite session cookie only (same as GET /api/kite/portfolio).
 */
export async function GET(req: NextRequest) {
  const token0 = await getKiteAccessToken();
  if (!token0) {
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

  let intervalMs = Math.floor(Number(req.nextUrl.searchParams.get("interval_ms") ?? 5000));
  if (!Number.isFinite(intervalMs)) intervalMs = 5000;
  intervalMs = Math.min(30_000, Math.max(2_000, intervalMs));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let noWsReconnect = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let pingTimer: ReturnType<typeof setInterval> | undefined;
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      let orderRestTimer: ReturnType<typeof setTimeout> | undefined;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

      let snapshot: MutablePortfolioSnapshot = clonePortfolioFromRest([], { net: [], day: [] });
      let lastAccessToken = token0;
      let kiteWs: WebSocket | null = null;
      let subscribedTokens: number[] = [];

      const closeAll = () => {
        if (closed) return;
        closed = true;
        noWsReconnect = true;
        if (pollTimer) clearInterval(pollTimer);
        if (pingTimer) clearInterval(pingTimer);
        if (flushTimer) clearTimeout(flushTimer);
        if (orderRestTimer) clearTimeout(orderRestTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        flushTimer = undefined;
        orderRestTimer = undefined;
        reconnectTimer = undefined;
        try {
          if (kiteWs) {
            kiteWs.removeAllListeners();
            if (kiteWs.readyState === WebSocket.OPEN || kiteWs.readyState === WebSocket.CONNECTING) {
              kiteWs.close();
            }
          }
        } catch {
          /* ignore */
        }
        kiteWs = null;
        subscribedTokens = [];
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closeAll();
        }
      };

      function rawToBuffer(raw: WebSocket.RawData): Buffer {
        if (Buffer.isBuffer(raw)) return raw;
        if (raw instanceof ArrayBuffer) return Buffer.from(raw);
        if (Array.isArray(raw)) return Buffer.concat(raw);
        return Buffer.from(raw);
      }

      const pushUpdate = () => {
        if (closed) return;
        send({
          type: "update",
          holdings: snapshot.holdings,
          positions: snapshot.positions,
          at: Date.now(),
        });
      };

      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          flushTimer = undefined;
          if (closed) return;
          pushUpdate();
        }, TICK_FLUSH_MS);
      };

      const resubscribe = (ws: WebSocket, next: number[]) => {
        if (subscribedTokens.length) {
          try {
            ws.send(JSON.stringify({ a: "unsubscribe", v: subscribedTokens }));
          } catch {
            /* ignore */
          }
        }
        subscribedTokens = [...next];
        if (!subscribedTokens.length) return;
        try {
          ws.send(JSON.stringify({ a: "subscribe", v: subscribedTokens }));
          ws.send(JSON.stringify({ a: "mode", v: ["ltp", subscribedTokens] }));
        } catch {
          /* ignore */
        }
      };

      const scheduleOrderRest = () => {
        if (orderRestTimer) clearTimeout(orderRestTimer);
        orderRestTimer = setTimeout(() => {
          orderRestTimer = undefined;
          if (closed) return;
          void restTick();
        }, ORDER_REST_DEBOUNCE_MS);
      };

      const scheduleWsReconnect = () => {
        if (closed || noWsReconnect) return;
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          if (closed || noWsReconnect) return;
          openKiteWs();
        }, 2_500);
      };

      const openKiteWs = () => {
        if (closed || noWsReconnect) return;
        if (kiteWs) {
          try {
            kiteWs.removeAllListeners();
            if (kiteWs.readyState === WebSocket.OPEN || kiteWs.readyState === WebSocket.CONNECTING) {
              kiteWs.close();
            }
          } catch {
            /* ignore */
          }
          kiteWs = null;
        }

        const url = `${KITE_WS}?api_key=${encodeURIComponent(apiKey)}&access_token=${encodeURIComponent(lastAccessToken)}`;
        const ws = new WebSocket(url);
        kiteWs = ws;

        ws.on("open", () => {
          if (kiteWs !== ws || closed) return;
          resubscribe(ws, instrumentTokensFromSnapshot(snapshot));
        });

        ws.on("message", (raw) => {
          if (kiteWs !== ws || closed) return;
          const buf = rawToBuffer(raw);
          const first = buf[0];
          if (first === 0x7b || first === 0x5b) {
            try {
              const j = JSON.parse(buf.toString("utf8")) as { type?: string };
              if (j.type === "order") {
                scheduleOrderRest();
              }
            } catch {
              /* ignore non-JSON text */
            }
            return;
          }

          const ticks = parseKiteTickerBinaryTicks(buf);
          let any = false;
          for (const t of ticks) {
            const ltp = kiteTickRawToInr(t.lastPriceRaw, t.instrumentToken);
            if (applyLtpTick(snapshot, t.instrumentToken, ltp)) any = true;
          }
          if (any) scheduleFlush();
        });

        ws.on("error", () => {
          /* close event follows */
        });

        ws.on("close", () => {
          if (kiteWs === ws) kiteWs = null;
          subscribedTokens = [];
          if (!closed && !noWsReconnect) scheduleWsReconnect();
        });
      };

      const restTick = async () => {
        if (closed) return;
        const token = await getKiteAccessToken();
        if (!token) {
          send({ type: "error", message: "not_connected" });
          closeAll();
          return;
        }
        const tokenRotated = token !== lastAccessToken;
        if (tokenRotated) {
          lastAccessToken = token;
          if (kiteWs) {
            try {
              kiteWs.removeAllListeners();
              if (kiteWs.readyState === WebSocket.OPEN || kiteWs.readyState === WebSocket.CONNECTING) {
                kiteWs.close();
              }
            } catch {
              /* ignore */
            }
            kiteWs = null;
            subscribedTokens = [];
          }
        }
        try {
          const [holdings, positions] = await Promise.all([
            kiteGet<unknown[]>("/portfolio/holdings", token),
            kiteGet<PositionsBody>("/portfolio/positions", token),
          ]);
          void persistKiteAccessTokenForWebhook(token);
          snapshot = clonePortfolioFromRest(holdings, positions);
          pushUpdate();
          if (!kiteWs || tokenRotated) {
            openKiteWs();
          } else if (kiteWs.readyState === WebSocket.OPEN) {
            resubscribe(kiteWs, instrumentTokensFromSnapshot(snapshot));
          }
        } catch (e) {
          send({
            type: "error",
            message: e instanceof Error ? e.message : "portfolio_fetch_failed",
          });
          closeAll();
        }
      };

      void (async () => {
        send({
          type: "connected",
          interval_ms: intervalMs,
          kite_ws: true,
          source: "https://kite.trade/docs/connect/v3/websocket/",
        });
        await restTick();
        if (closed) return;
        pingTimer = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            closeAll();
          }
        }, 20_000);
        pollTimer = setInterval(() => void restTick(), intervalMs);
      })();

      req.signal.addEventListener("abort", closeAll);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
