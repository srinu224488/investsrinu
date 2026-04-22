/** Kite Connect JSON envelope for order placement (and similar APIs). */

export type KitePlaceOrderData = { order_id: string };

export type KiteSuccess<T = unknown> = { status: "success"; data: T };

export type KiteErrorEnvelope = {
  status: "error";
  message: string;
  error_type: string;
};

export type KiteEnvelope<T = unknown> = KiteSuccess<T> | KiteErrorEnvelope;

export function isKiteErrorEnvelope(e: KiteEnvelope): e is KiteErrorEnvelope {
  return e.status === "error";
}
