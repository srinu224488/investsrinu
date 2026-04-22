import type { Metadata } from "next";
import AutomatedOrdersView from "@/components/automated-orders/AutomatedOrdersView";

export const metadata: Metadata = {
  title: "Automated orders — Kiteob",
  description: "TradingView webhook placement results and live order status",
};

export default function AutomatedOrdersPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Automated orders</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Each TradingView webhook run: whether an order was placed, broker order id, and
          current status from Kite when you are logged in on this site.
        </p>
      </header>
      <AutomatedOrdersView />
    </div>
  );
}
