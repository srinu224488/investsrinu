import type { WebhookEvent } from "./webhook-events";
import {
  mapTradingViewBodyToKiteOrder,
  tradingViewOrderMapFailureMessage,
} from "./tradingview-kite-order";

export type WebhookOrderIntentRow = {
  event_id: string;
  receivedAt: string;
  map_ok: boolean;
  map_reason?: string;
  map_message?: string;
  exchange?: string;
  tradingsymbol?: string;
  transaction_type?: string;
  quantity?: number;
  product?: string;
  order_type?: string;
  price?: number;
  trigger_price?: number;
  validity?: string;
  tag?: string;
  variety?: string;
};

export function webhookEventToOrderIntent(event: WebhookEvent): WebhookOrderIntentRow {
  const mapped = mapTradingViewBodyToKiteOrder(event.body);
  if (mapped.ok) {
    const f = mapped.fields;
    return {
      event_id: event.id,
      receivedAt: event.receivedAt,
      map_ok: true,
      exchange: f.exchange,
      tradingsymbol: f.tradingsymbol,
      transaction_type: f.transaction_type,
      quantity: f.quantity,
      product: f.product,
      order_type: f.order_type,
      price: f.price,
      trigger_price: f.trigger_price,
      validity: f.validity,
      tag: f.tag,
      variety: f.variety,
    };
  }
  return {
    event_id: event.id,
    receivedAt: event.receivedAt,
    map_ok: false,
    map_reason: mapped.reason,
    map_message: tradingViewOrderMapFailureMessage(mapped.reason),
  };
}

export function webhookEventsToOrderIntents(events: WebhookEvent[]): WebhookOrderIntentRow[] {
  return events.map(webhookEventToOrderIntent);
}
