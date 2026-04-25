import type { Metadata } from "next";
import OrderFlowLogView from "@/components/order-flow-log/OrderFlowLogView";

export const metadata: Metadata = {
  title: "Logs — Kiteob",
  description: "Order flow step-by-step logs from TradingView webhooks",
};

export default function LogsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Step-by-step order flow log from TradingView webhook events.
        </p>
      </header>
      <OrderFlowLogView />
    </div>
  );
}
