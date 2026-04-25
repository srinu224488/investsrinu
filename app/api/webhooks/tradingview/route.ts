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
import { kiteGet } from "@/lib/kite-client";
import { persistOpenOrderSnapshotFromKite } from "@/lib/open-order-history";
import { appendWebhookEvent } from "@/lib/webhook-events";
import { appendWebhookErrorLog } from "@/lib/webhook-error-log";
import { exitBeforePlace } from "@/lib/kite-exit-before-place";
import { appendWebhookPlacementLog } from "@/lib/webhook-placement-log";
import { appendOrderFlowLog } from "@/lib/order-flow-log";
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
 * `exit_before_place` (cancelled pending orders + exit order for any open position) are appended for correlation.
 * Before placing: order fields are validated like POST /orders, quantity vs Kite `lot_size` from
 * `GET /instruments/:exchange` (lot map in MongoDB when `MONGODB_URI` is set; TTL
 * `KITE_INSTRUMENTS_CACHE_MS`, default 1 day), then GET /quote/ltp confirms the instrument exists.
 * Then GET /orders + GET /portfolio/positions: all non-terminal pending orders for the symbol/product are cancelled
 * and any net open day position is exited with a MARKET order before the new webhook order is placed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const payloadRaw = parseTradingViewWebhookPayload(raw);

  const denied = await tradingViewWebhookAuthResponse(req, payloadRaw);
  if (denied) return denied;

  const payload = stripWebhookSecretFromPayload(payloadRaw);

  const stored = await appendWebhookEvent(payload);

  await appendOrderFlowLog({
    webhook_event_id: stored.id,
    step: "webhook_received",
    message: "TradingView webhook message received",
  });

  const mapped = mapTradingViewBodyToKiteOrder(payload);
  if (!mapped.ok) {
    const message = tradingViewOrderMapFailureMessage(mapped.reason);
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "not_placed_invalid_payload",
        message,
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        message,
      }),
      logTradingViewError(stored.id, message, "InputException", {
        map_reason: mapped.reason,
      }),
    ]);
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
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "not_placed_no_token",
        message,
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        message,
      }),
      logTradingViewError(stored.id, message, "TokenException"),
    ]);
    return NextResponse.json({
      status: "error",
      message,
      error_type: "TokenException",
      webhook_event_id: stored.id,
    });
  }

  const exec = await validateWebhookOrderExecutable(kiteAt, mapped.fields);
  if (!exec.ok) {
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "not_placed_not_executable",
        message: exec.message,
        error_type: exec.error_type,
        intent: intentFromFields(mapped.fields),
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        transaction_type: mapped.fields.transaction_type,
        order_type: mapped.fields.order_type,
        quantity: mapped.fields.quantity,
        message: exec.message,
      }),
      logTradingViewError(stored.id, exec.message, exec.error_type),
    ]);
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
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "not_placed_orders_fetch_failed",
        message,
        intent: intentFromFields(mapped.fields),
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        transaction_type: mapped.fields.transaction_type,
        order_type: mapped.fields.order_type,
        quantity: mapped.fields.quantity,
        message,
      }),
      logTradingViewError(stored.id, message, "NetworkException"),
    ]);
    return NextResponse.json({
      status: "error",
      message,
      error_type: "NetworkException",
      webhook_event_id: stored.id,
    });
  }

  const incomingSide = (mapped.fields.transaction_type ?? "").toUpperCase();
  const oppositeSide = incomingSide === "BUY" ? "SELL" : incomingSide === "SELL" ? "BUY" : "";
  await appendOrderFlowLog({
    webhook_event_id: stored.id,
    step: "position_check",
    tradingsymbol: mapped.fields.tradingsymbol,
    exchange: mapped.fields.exchange,
    product: mapped.fields.product,
    transaction_type: mapped.fields.transaction_type,
    message: `New signal: ${incomingSide} ${mapped.fields.tradingsymbol ?? ""}. Checking for open ${oppositeSide} position${oppositeSide ? " to close" : "s"} and pending orders to cancel before placing entry.`,
  });

  const exit_before_place = await exitBeforePlace(kiteAt, mapped.fields, orders);

  const exitFlowLogs = [
    ...exit_before_place.cancelled.map((c) =>
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "exit_cancelled",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        order_id: c.order_id,
        message: "Pending order cancelled before placing new entry",
        payload: c.payload,
        response: c.response,
      }),
    ),
    ...(exit_before_place.exit_order_id
      ? [
          appendOrderFlowLog({
            webhook_event_id: stored.id,
            step: "exit_order_placed",
            tradingsymbol: mapped.fields.tradingsymbol,
            exchange: mapped.fields.exchange,
            product: mapped.fields.product,
            transaction_type: exit_before_place.exit_transaction_type,
            order_type: "MARKET",
            quantity: exit_before_place.exit_quantity,
            order_id: exit_before_place.exit_order_id,
            message: `Position squared off — ${exit_before_place.exit_transaction_type ?? "MARKET"} ${exit_before_place.exit_quantity ?? ""} ${mapped.fields.tradingsymbol ?? ""} before new entry`,
            payload: exit_before_place.exit_order_payload,
            response: exit_before_place.exit_order_response,
          }),
        ]
      : []),
  ];
  if (exitFlowLogs.length > 0) await Promise.all(exitFlowLogs);

  const exitDiagLogs: Promise<void>[] = [];

  if (exit_before_place.positions_fetch_error) {
    exitDiagLogs.push(
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        message: `positions_fetch_error: ${exit_before_place.positions_fetch_error}`,
      }),
    );
  } else {
    // Always log what the positions scan found so we can diagnose missing exits.
    const matchedQty = exit_before_place.matched_position_quantity;
    const netCount = exit_before_place.net_positions_count ?? 0;
    const scanMsg =
      matchedQty === null
        ? `Position scan: ${netCount} net position(s) — no row matched ${mapped.fields.exchange}:${mapped.fields.tradingsymbol} ${mapped.fields.product}`
        : `Position scan: matched ${mapped.fields.exchange}:${mapped.fields.tradingsymbol} ${mapped.fields.product} qty=${matchedQty}`;
    exitDiagLogs.push(
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "position_check",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        message: scanMsg,
      }),
    );
  }

  for (const er of exit_before_place.errors) {
    exitDiagLogs.push(
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_skipped",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        message: `exit_error (${er.order_id}): ${er.message}`,
      }),
    );
  }

  if (exitDiagLogs.length > 0) await Promise.all(exitDiagLogs);

  const env = await placeKiteOrder(kiteAt, mapped.fields);

  if (env.status === "success") {
    const order_id =
      env.data &&
      typeof env.data === "object" &&
      env.data !== null &&
      "order_id" in env.data
        ? String((env.data as { order_id?: unknown }).order_id ?? "").trim()
        : "";
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "placed",
        ...(order_id ? { order_id } : {}),
        intent: intentFromFields(mapped.fields),
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_placed",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        transaction_type: mapped.fields.transaction_type,
        order_type: mapped.fields.order_type ?? "MARKET",
        quantity: mapped.fields.quantity,
        ...(order_id ? { order_id } : {}),
        message: `${mapped.fields.transaction_type ?? ""} order placed successfully`,
        payload: mapped.fields,
        response: env,
      }),
    ]);
  } else {
    await Promise.all([
      appendWebhookPlacementLog({
        webhook_event_id: stored.id,
        outcome: "not_placed_kite_reject",
        message: env.message,
        error_type: env.error_type,
        intent: intentFromFields(mapped.fields),
      }),
      appendOrderFlowLog({
        webhook_event_id: stored.id,
        step: "order_rejected",
        tradingsymbol: mapped.fields.tradingsymbol,
        exchange: mapped.fields.exchange,
        product: mapped.fields.product,
        transaction_type: mapped.fields.transaction_type,
        order_type: mapped.fields.order_type ?? "MARKET",
        quantity: mapped.fields.quantity,
        message: env.message || "Kite rejected the order",
        payload: mapped.fields,
        response: env,
      }),
      logTradingViewError(
        stored.id,
        env.message || "Kite place order failed",
        env.error_type,
        {
          kite_status: env.status,
          kite_message: env.message,
          kite_error_type: env.error_type,
        },
      ),
    ]);
  }

  const openSnap = await persistOpenOrderSnapshotFromKite(
    kiteAt,
    "tradingview_webhook",
    { webhook_event_id: stored.id },
  );

  return NextResponse.json({
    ...env,
    webhook_event_id: stored.id,
    exit_before_place,
    open_order_snapshot_id: openSnap?.id ?? null,
    executable: true,
  });
}
