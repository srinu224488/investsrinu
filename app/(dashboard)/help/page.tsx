import type { Metadata } from "next";
import WebhooksHelpView from "@/components/dashboard/WebhooksHelpView";

export const metadata: Metadata = {
  title: "Webhooks help — Kiteob",
  description:
    "TradingView and Kite postback URLs, payload formats, auth, and testing",
};

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks help</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Kite postback, TradingView payload formats, secrets, and how to verify
          orders.
        </p>
      </header>
      <WebhooksHelpView />
    </div>
  );
}
