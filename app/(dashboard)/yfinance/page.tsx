import type { Metadata } from "next";
import { YahooFinanceSection } from "@/components/dashboard/YahooFinanceSection";

export const metadata: Metadata = {
  title: "Yahoo Finance — Kiteob",
  description: "Look up Yahoo Finance symbols and quote data",
};

export default function YahooFinancePage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Yahoo Finance</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter a symbol (e.g. RELIANCE.NS) to fetch data from the Yahoo Finance API.
        </p>
      </header>
      <YahooFinanceSection />
    </div>
  );
}
