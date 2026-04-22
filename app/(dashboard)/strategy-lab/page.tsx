import type { Metadata } from "next";
import StrategyLabView from "@/components/strategy-lab/StrategyLabView";

export const metadata: Metadata = {
  title: "Strategy lab — Kiteob",
  description:
    "Watchlist batch snapshots and live EMA/RSI streams on Kite OHLC",
};

export default function StrategyLabPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Strategy lab</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Run the same indicator engines on <strong className="font-medium text-zinc-800 dark:text-zinc-200">Kite historical OHLC</strong> for
          a watchlist, and optionally stream <strong className="font-medium text-zinc-800 dark:text-zinc-200">live LTP</strong> for the first
          symbol to refresh the <em>current</em> candle. Connect Kite on the home page. The server must
          have <code className="rounded bg-zinc-100 px-1 font-mono text-[0.8em] dark:bg-zinc-800">KITE_API_KEY</code> for
          the Kite WebSocket (LTP) to work. This is a research tool, not advice.
        </p>
      </header>
      <StrategyLabView />
    </div>
  );
}
