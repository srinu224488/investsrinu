import type { Metadata } from "next";
import WebhookErrorsView from "@/components/webhook-errors/WebhookErrorsView";

export const metadata: Metadata = {
  title: "Webhook errors — Kiteob",
  description: "TradingView webhook placement failures",
};

export default function WebhookErrorsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Webhook errors</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Failures from the TradingView webhook (mapping, token, Kite API, duplicates,
          place-order errors). Requires an active Kite session on this site.
        </p>
      </header>
      <WebhookErrorsView />
    </div>
  );
}
