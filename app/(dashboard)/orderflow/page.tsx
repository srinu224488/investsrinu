import type { Metadata } from "next";
import OpenOrderHistoryView from "@/components/orderflow/OpenOrderHistoryView";

export const metadata: Metadata = {
  title: "Order flow — Kiteob",
  description: "Open order book history",
};

export default function OrderflowPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Order flow</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Alerts, open snapshots, and executed or closed orders from Kite.
        </p>
      </header>
      <OpenOrderHistoryView />
    </div>
  );
}
