import { NextRequest, NextResponse } from "next/server";
import { parseTradingViewWebhookPayload } from "@/lib/tradingview-alert-body";
import { placeKiteOrder } from "@/lib/kite-place-order";
import { getKiteAccessTokenForWebhook } from "@/lib/kite-webhook-access-token";
import {
  mapTradingViewBodyToKiteOrder,
  tradingViewOrderMapFailureMessage,
} from "@/lib/tradingview-kite-order";
import {
  stripWebhookSecretFromPayload,
  tradingViewWebhookAuthResponse,
} from "@/lib/tradingview-webhook-auth";
import {
  cancelOppositePendingOrders,
  cancelSameSidePendingOrders,
} from "@/lib/kite-cancel-opposite-before-place";
import { kiteGet } from "@/lib/kite-client";
import { persistOpenOrderSnapshotFromKite } from "@/lib/open-order-history";
import { appendWebhookEvent } from "@/lib/webhook-events";
import { appendWebhookErrorLog } from "@/lib/webhook-error-log";
import { appendWebhookPlacementLog } from "@/lib/webhook-placement-log";
import { validateWebhookOrderExecutable } from "@/lib/webhook-order-executable";
import type { KitePlaceOrderBody } from "@/lib/kite-place-order";

function intentFromFields(f: KitePlaceOrderBody) {
  return {
    exchange: f.exchange,
    tradingsymbol: f.tradingsymbol,
    product: f.product,
    transaction_type: f.transaction_type,
    quantity: f.quantity,
  };
}

async function logTradingViewError(
  webhook_event_id: string,
  message: string,
  error_type?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await appendWebhookErrorLog({
    source: "tradingview_webhook",
    webhook_event_id,
    message,
    error_type,
    detail,
  });
}

/**
 * TradingView (and similar) JSON webhooks — no Kite checksum.
 * Use this URL in the alert; keep /api/webhooks/kite for Zerodha postbacks only.
 * Body: JSON, or JSON with bare-word string fields (e.g. `"exchange": TVC`) repaired when possible; else `{ text: "…" }`.
 *
 * Order path: payload is mapped to Kite place-order fields, validated (Kite rules), then POSTed when a server token exists:
 * `KITE_ACCESS_TOKEN` env, or (with MongoDB) the token saved at Kite OAuth login.
 * JSON responses follow Kite’s envelope (`status`, `data` | `message` + `error_type`). `webhook_event_id` and
 * `pre_place_cancels` (opposite-side pending cancels), `pre_place_same_side_cancels` (same-side replace),
 * are appended for correlation. Placement runs even if cancels fail.
 * Before placing: order fields are validated like POST /orders, quantity vs Kite `lot_size` from
 * `GET /instruments/:exchange` (lot map in MongoDB when `MONGODB_URI` is set; TTL
 * `KITE_INSTRUMENTS_CACHE_MS`, default 1 day), then GET /quote/ltp
 * confirms the instrument exists.
 * Then GET /orders: opposite-side pending orders are cancelled, then same-side pending orders for that
 * symbol/product/exchange (replace), then the new order is placed (BUY/SELL from `action`/`event`).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const payloadRaw = parseTradingViewWebhookPayload(raw);

  const denied = await tradingViewWebhookAuthResponse(req, payloadRaw);
  if (denied) return denied;

  const payload = stripWebhookSecretFromPayload(payloadRaw);

  const stored = await appendWebhookEvent(payload);

  const mapped = mapTradingViewBodyToKiteOrder(payload);
  if (!mapped.ok) {
    const message = tradingViewOrderMapFailureMessage(mapped.reason);
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "not_placed_invalid_payload",
      message,
    });
    await logTradingViewError(stored.id, message, "InputException", {
      map_reason: mapped.reason,
    });
    return NextResponse.json({
      status: "error",
      message,
      error_type: "InputException",
      webhook_event_id: stored.id,
    });
  }

  const kiteAt = await getKiteAccessTokenForWebhook();
  if (!kiteAt) {
    const hasMongo = Boolean(process.env.MONGODB_URI?.trim());
    const message = hasMongo
      ? "Kite access token missing for webhooks: set KITE_ACCESS_TOKEN, or open this app in a browser while logged into Kite (dashboard/order flow syncs the token to MongoDB for TradingView)"
      : "Kite access token is not configured for server-side placement (set KITE_ACCESS_TOKEN on the server)";
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "not_placed_no_token",
      message,
    });
    await logTradingViewError(stored.id, message, "TokenException");
    return NextResponse.json({
      status: "error",
      message,
      error_type: "TokenException",
      webhook_event_id: stored.id,
    });
  }

  const exec = await validateWebhookOrderExecutable(kiteAt, mapped.fields);
  if (!exec.ok) {
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "not_placed_not_executable",
      message: exec.message,
      error_type: exec.error_type,
      intent: intentFromFields(mapped.fields),
    });
    await logTradingViewError(stored.id, exec.message, exec.error_type);
    return NextResponse.json({
      status: "error",
      message: exec.message,
      error_type: exec.error_type,
      webhook_event_id: stored.id,
      executable: false,
    });
  }

  let orders: unknown[];
  try {
    orders = await kiteGet<unknown[]>("/orders", kiteAt);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to fetch orders from Kite";
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "not_placed_orders_fetch_failed",
      message,
      intent: intentFromFields(mapped.fields),
    });
    await logTradingViewError(stored.id, message, "NetworkException");
    return NextResponse.json({
      status: "error",
      message,
      error_type: "NetworkException",
      webhook_event_id: stored.id,
    });
  }

  const pre_place_cancels = await cancelOppositePendingOrders(
    kiteAt,
    mapped.fields,
    orders,
  );

  const pre_place_same_side_cancels = await cancelSameSidePendingOrders(
    kiteAt,
    mapped.fields,
    orders,
  );

  const env = await placeKiteOrder(kiteAt, mapped.fields);

  if (env.status === "success") {
    const order_id =
      env.data &&
      typeof env.data === "object" &&
      env.data !== null &&
      "order_id" in env.data
        ? String((env.data as { order_id?: unknown }).order_id ?? "").trim()
        : "";
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "placed",
      ...(order_id ? { order_id } : {}),
      intent: intentFromFields(mapped.fields),
    });
  } else {
    await appendWebhookPlacementLog({
      webhook_event_id: stored.id,
      outcome: "not_placed_kite_reject",
      message: env.message,
      error_type: env.error_type,
      intent: intentFromFields(mapped.fields),
    });
    await logTradingViewError(
      stored.id,
      env.message || "Kite place order failed",
      env.error_type,
      {
        kite_status: env.status,
        kite_message: env.message,
        kite_error_type: env.error_type,
      },
    );
  }

  const openSnap = await persistOpenOrderSnapshotFromKite(
    kiteAt,
    "tradingview_webhook",
    { webhook_event_id: stored.id },
  );

  return NextResponse.json({
    ...env,
    webhook_event_id: stored.id,
    pre_place_cancels,
    pre_place_same_side_cancels,
    open_order_snapshot_id: openSnap?.id ?? null,
    executable: true,
  });
}
