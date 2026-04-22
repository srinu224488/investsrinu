import type { SymbolChargeBreakdown } from "@/lib/kite-order-charges";

import type { OrderRow, ProfilePayload, WebhookRow } from "./types";

export type ProfileResponse = {
  connected?: boolean;
  profile?: ProfilePayload;
  error?: string;
};

/** Kite returns this when the cookie token is stale or the server API key changed. */
export function isInvalidKiteCredentialsError(message: string | undefined): boolean {
  if (!message) return false;
  const s = message.toLowerCase();
  return (
    s.includes("incorrect") &&
    s.includes("api_key") &&
    s.includes("access_token")
  );
}

export async function fetchKiteProfile(): Promise<ProfileResponse> {
  const r = await fetch("/api/kite/profile");
  return (await r.json()) as ProfileResponse;
}

export type OrdersWithChargesResponse = {
  orders?: OrderRow[];
  chargeTotals?: Record<string, SymbolChargeBreakdown>;
  chargesError?: string;
  error?: string;
};

export async function fetchKiteOrdersWithCharges(): Promise<{
  ok: boolean;
  data: OrdersWithChargesResponse;
}> {
  const r = await fetch("/api/kite/orders?charges=1&save_open_history=1");
  const j = (await r.json()) as OrdersWithChargesResponse;
  return { ok: r.ok, data: j };
}

export async function fetchWebhookEventsKite(): Promise<{
  ok: boolean;
  events: WebhookRow[];
  error?: string;
  statusText: string;
}> {
  const r = await fetch(
    `/api/webhooks/kite/events?_=${Date.now()}`,
    { cache: "no-store" },
  );
  const j = (await r.json()) as { events?: WebhookRow[]; error?: string };
  if (!r.ok) {
    return {
      ok: false,
      events: [],
      error: j.error || r.statusText,
      statusText: r.statusText,
    };
  }
  return {
    ok: true,
    events: j.events || [],
    statusText: r.statusText,
  };
}

export async function fetchPostbackUrl(): Promise<{
  url?: string;
  fromEnv?: boolean;
}> {
  const r = await fetch("/api/kite/postback-url");
  return (await r.json()) as { url?: string; fromEnv?: boolean };
}

export type PlaceOrderBody = {
  variety: string;
  exchange: string;
  tradingsymbol: string;
  transaction_type: string;
  quantity: number;
  product: string;
  order_type: string;
  price?: number;
  trigger_price?: number;
  /** MARKET / SL-M only; omit to use Kite auto (-1). */
  market_protection?: number;
  validity: string;
  tag?: string;
};

export async function postKitePlaceOrder(
  body: PlaceOrderBody,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const r = await fetch("/api/kite/orders/place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as {
    status?: string;
    data?: { order_id?: string };
    message?: string;
    error_type?: string;
  };
  if (r.status === 401 || j.status === "error") {
    return {
      ok: false,
      error: j.message || "Order failed",
    };
  }
  if (j.status === "success" && j.data?.order_id) {
    return { ok: true, orderId: j.data.order_id };
  }
  return { ok: false, error: j.message || "Unexpected response" };
}

export async function postKiteLogout(): Promise<void> {
  await fetch("/api/kite/logout", { method: "POST" });
}
