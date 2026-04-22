import type { Metadata } from "next";
import MaCrossStrategyView from "@/components/ma-cross/MaCrossStrategyView";

export const metadata: Metadata = {
  title: "MA cross strategy — Kiteob",
  description: "SMA cross confirmation on Kite historical OHLC",
};

export default function MaCrossPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">MA cross strategy</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          SMA(close, length) with consecutive-bar confirmation on Kite historical data; optional
          live LTP via Kite WebSocket (server stream). Connect Kite on the home page first (or
          set a server access token).
        </p>
      </header>
      <MaCrossStrategyView />
    </div>
  );
}
