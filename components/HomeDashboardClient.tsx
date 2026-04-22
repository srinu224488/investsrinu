"use client";

import dynamic from "next/dynamic";

/** Client-only load avoids SSR/client HTML drift on overview (Turbopack). */
const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div
      className="flex flex-col gap-8"
      aria-busy="true"
      aria-label="Loading overview"
    >
      <div className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      <div className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <div className="min-w-0 h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        <div className="min-w-0 h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    </div>
  ),
});

export default function HomeDashboardClient() {
  return <Dashboard />;
}
