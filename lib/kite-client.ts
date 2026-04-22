import type { KiteEnvelope } from "./kite-api-envelope";
import { sanitizeKiteTag } from "./kite-order-validate";

const KITE_API = "https://api.kite.trade";

function apiKey(): string {
  const k = process.env.KITE_API_KEY?.trim();
  if (!k) throw new Error("KITE_API_KEY is not set");
  return k;
}

export async function kiteGet<T = unknown>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${KITE_API}${path}`, {
    headers: {
      Authorization: `token ${apiKey()}:${accessToken}`,
      "X-Kite-Version": "3",
    },
    cache: "no-store",
  });
  const body = (await res.json()) as {
    status?: string;
    message?: string;
    error_type?: string;
    data?: T;
  };
  if (!res.ok || body.status === "error") {
    throw new Error(
      body.message || body.error_type || `Kite HTTP ${res.status}`,
    );
  }
  return body.data as T;
}

/** Non-JSON Kite responses (e.g. GET /instruments/:exchange CSV). */
export async function kiteGetText(
  path: string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${KITE_API}${path}`, {
    headers: {
      Authorization: `token ${apiKey()}:${accessToken}`,
      "X-Kite-Version": "3",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Kite HTTP ${res.status}`);
  }
  return res.text();
}

/** Kite Connect v3: GET /orders/:order_id (order history / status timeline). */
export async function kiteGetOrderHistory(
  orderId: string,
  accessToken: string,
): Promise<unknown[]> {
  const id = encodeURIComponent(orderId.trim());
  return kiteGet<unknown[]>(`/orders/${id}`, accessToken);
}

/** Kite Connect v3: GET /orders/:order_id/trades (executed fills for that order). */
export async function kiteGetOrderTrades(
  orderId: string,
  accessToken: string,
): Promise<unknown[]> {
  const id = encodeURIComponent(orderId.trim());
  return kiteGet<unknown[]>(`/orders/${id}/trades`, accessToken);
}

export async function kitePostJson<T = unknown>(
  path: string,
  accessToken: string,
  jsonBody: unknown,
): Promise<T> {
  const res = await fetch(`${KITE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `token ${apiKey()}:${accessToken}`,
      "X-Kite-Version": "3",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonBody),
    cache: "no-store",
  });
  const body = (await res.json()) as {
    status?: string;
    message?: string;
    error_type?: string;
    data?: T;
  };
  if (!res.ok || body.status === "error") {
    throw new Error(
      body.message || body.error_type || `Kite HTTP ${res.status}`,
    );
  }
  return body.data as T;
}

export async function kitePostForm<T = unknown>(
  path: string,
  accessToken: string,
  fields: Record<string, string | number | undefined>,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === "") continue;
    if (k === "tag") {
      const st = sanitizeKiteTag(v);
      if (!st) continue;
      params.set(k, st);
      continue;
    }
    params.set(k, String(v));
  }
  const res = await fetch(`${KITE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `token ${apiKey()}:${accessToken}`,
      "X-Kite-Version": "3",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });
  const body = (await res.json()) as {
    status?: string;
    message?: string;
    error_type?: string;
    data?: T;
  };
  if (!res.ok || body.status === "error") {
    throw new Error(
      body.message || body.error_type || `Kite HTTP ${res.status}`,
    );
  }
  return body.data as T;
}

/** Full JSON envelope as returned by Kite (success or error); does not throw on API error body. */
export async function kitePostFormEnvelope<T = unknown>(
  path: string,
  accessToken: string,
  fields: Record<string, string | number | undefined>,
): Promise<KiteEnvelope<T>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === "") continue;
    if (k === "tag") {
      const st = sanitizeKiteTag(v);
      if (!st) continue;
      params.set(k, st);
      continue;
    }
    params.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(`${KITE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `token ${apiKey()}:${accessToken}`,
        "X-Kite-Version": "3",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });
  } catch {
    return {
      status: "error",
      message: "Network error calling Kite API",
      error_type: "NetworkException",
    };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return {
      status: "error",
      message: `Kite returned non-JSON (HTTP ${res.status})`,
      error_type: "NetworkException",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "error",
      message: "Invalid response from Kite",
      error_type: "NetworkException",
    };
  }
  const b = parsed as KiteEnvelope<T>;
  if (b.status === "success" || b.status === "error") {
    return b;
  }
  return {
    status: "error",
    message: "Unexpected Kite response shape",
    error_type: "NetworkException",
  };
}

/** DELETE /orders/:variety/:order_id — full envelope; does not throw on API error body. */
export async function kiteDeleteEnvelope<T = unknown>(
  variety: string,
  orderId: string,
  accessToken: string,
  parentOrderId?: string,
): Promise<KiteEnvelope<T>> {
  const v = encodeURIComponent(variety.trim());
  const id = encodeURIComponent(orderId.trim());
  const q =
    parentOrderId && String(parentOrderId).trim()
      ? `?parent_order_id=${encodeURIComponent(String(parentOrderId).trim())}`
      : "";
  const path = `/orders/${v}/${id}${q}`;
  let res: Response;
  try {
    res = await fetch(`${KITE_API}${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `token ${apiKey()}:${accessToken}`,
        "X-Kite-Version": "3",
      },
      cache: "no-store",
    });
  } catch {
    return {
      status: "error",
      message: "Network error calling Kite API",
      error_type: "NetworkException",
    };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return {
      status: "error",
      message: `Kite returned non-JSON (HTTP ${res.status})`,
      error_type: "NetworkException",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "error",
      message: "Invalid response from Kite",
      error_type: "NetworkException",
    };
  }
  const b = parsed as KiteEnvelope<T>;
  if (b.status === "success" || b.status === "error") {
    return b;
  }
  return {
    status: "error",
    message: "Unexpected Kite response shape",
    error_type: "NetworkException",
  };
}
