import type { Metadata } from "next";
import Link from "next/link";
import PortfolioProfileView from "@/components/portfolio/PortfolioProfileView";

export const metadata: Metadata = {
  title: "Portfolio — Kiteob",
  description: "Kite holdings and positions with profit and loss",
};

export default function ProfilePortfolioPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="text-teal-700 hover:underline dark:text-teal-400">
            Overview
          </Link>
          <span className="mx-1.5 text-zinc-400">/</span>
          Portfolio
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Holdings &amp; positions</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Demat holdings (total and day P&amp;L) and trading positions (net and day) from your connected Kite session.
        </p>
      </header>
      <PortfolioProfileView />
    </div>
  );
}
