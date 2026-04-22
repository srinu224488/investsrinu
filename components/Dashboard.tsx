"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardHeader } from "./dashboard/DashboardHeader";
import { fetchWebhookEventsKite, postKitePlaceOrder } from "./dashboard/kite-fetch";
import { KiteConnectSection } from "./dashboard/KiteConnectSection";
import { useKiteSession } from "./dashboard/KiteSessionProvider";
import { KitePlaceOrderSection } from "./dashboard/KitePlaceOrderSection";
import { PostbackWebhookSection } from "./dashboard/PostbackWebhookSection";

import type { WebhookRow } from "./dashboard/types";

export default function Dashboard() {
  const { profile, kiteRedirectMsg, dismissKiteMsg } = useKiteSession();
  const [events, setEvents] = useState<WebhookRow[]>([]);
  const [eventsUpdatedAt, setEventsUpdatedAt] = useState<string | null>(null);
  const [eventsErr, setEventsErr] = useState<string | null>(null);
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const placeOrderFormRef = useRef<HTMLFormElement>(null);

  const loadEvents = useCallback(async () => {
    setEventsErr(null);
    try {
      const res = await fetchWebhookEventsKite();
      if (!res.ok) {
        setEventsErr(res.error || res.statusText);
        setEvents([]);
        return;
      }
      setEvents(res.events);
      setEventsUpdatedAt(new Date().toISOString());
    } catch (err) {
      setEventsErr(err instanceof Error ? err.message : "failed to load events");
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function placeOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = placeOrderFormRef.current ?? e.currentTarget;
    if (!form) return;
    setPlaceMsg(null);
    const fd = new FormData(form);
    const variety = String(fd.get("variety") || "regular");
    const exchange = String(fd.get("exchange") || "NSE");
    const tradingsymbol = String(fd.get("tradingsymbol") || "").trim();
    const transaction_type = String(fd.get("transaction_type") || "BUY");
    const quantity = Number(fd.get("quantity"));
    const product = String(fd.get("product") || "CNC");
    const order_type = String(fd.get("order_type") || "MARKET");
    const priceRaw = fd.get("price");
    const triggerRaw = fd.get("trigger_price");
    const price =
      priceRaw && String(priceRaw) !== "" ? Number(priceRaw) : undefined;
    const trigger_price =
      triggerRaw && String(triggerRaw) !== ""
        ? Number(triggerRaw)
        : undefined;
    const validity = String(fd.get("validity") || "DAY");
    const tag = String(fd.get("tag") || "").trim() || undefined;
    const mpRaw = fd.get("market_protection");
    const market_protection =
      (order_type === "MARKET" || order_type === "SL-M") &&
      mpRaw != null &&
      String(mpRaw).trim() !== ""
        ? Number(mpRaw)
        : undefined;

    setBusy(true);
    try {
      const res = await postKitePlaceOrder({
        variety,
        exchange,
        tradingsymbol,
        transaction_type,
        quantity,
        product,
        order_type,
        price,
        trigger_price,
        market_protection:
          Number.isFinite(market_protection) ? market_protection : undefined,
        validity,
        tag,
      });
      if (!res.ok) {
        setPlaceMsg(res.error || "Order failed");
        return;
      }
      setPlaceMsg(`Placed. Order id: ${res.orderId ?? "—"}`);
      placeOrderFormRef.current?.reset();
    } catch (err) {
      setPlaceMsg(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        kiteRedirectMsg={kiteRedirectMsg}
        onDismissKiteMsg={dismissKiteMsg}
      />

      <KiteConnectSection />

      <div className="grid grid-cols-1 items-start gap-8 scroll-mt-6 lg:grid-cols-2">
        <div className="min-w-0">
          <PostbackWebhookSection
            events={events}
            eventsUpdatedAt={eventsUpdatedAt}
            eventsErr={eventsErr}
            onRefreshEvents={loadEvents}
          />
        </div>
        <div id="place-order" className="min-w-0 scroll-mt-6 lg:scroll-mt-0">
          <KitePlaceOrderSection
            ref={placeOrderFormRef}
            profile={profile}
            busy={busy}
            placeMsg={placeMsg}
            onSubmit={placeOrder}
          />
        </div>
      </div>
    </div>
  );
}
