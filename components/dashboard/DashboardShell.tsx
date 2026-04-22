"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

const KiteHeaderSession = dynamic(() => import("./KiteHeaderSession"), {
  ssr: false,
  loading: () => (
    <span
      className="inline-flex size-9 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700"
      aria-hidden
    />
  ),
});

const primaryNav = [
  { href: "/", label: "Overview" },
  { href: "/profile", label: "Portfolio" },
  { href: "/orderflow", label: "Order flow" },
  { href: "/automated-orders", label: "Automated orders" },
  { href: "/webhook-errors", label: "Webhook errors" },
  { href: "/strategy-lab", label: "Strategy lab" },
  { href: "/ma-cross", label: "MA cross" },
  { href: "/yfinance", label: "Yahoo Finance" },
  { href: "/help", label: "Help" },
] as const;

function NavIcon({ name }: { name: (typeof primaryNav)[number]["label"] }) {
  const common = "h-5 w-5 shrink-0";
  switch (name) {
    case "Overview":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75a2.25 2.25 0 012.25-2.25h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-2.25z"
          />
        </svg>
      );
    case "Portfolio":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6.75A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75V12m18 0h-4.5M3 12h4.5m0 0H9m6 0h1.5M12 8.25V12"
          />
        </svg>
      );
    case "Order flow":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
      );
    case "Automated orders":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
      );
    case "Webhook errors":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      );
    case "Strategy lab":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 19h16M6 15l4-8 4 8m-6-4h4"
          />
        </svg>
      );
    case "MA cross":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 13.5l6.09-6.09a.75.75 0 011.06 0l2.94 2.94m3.12-1.68l1.5-1.5a.75.75 0 011.06 0L21 9.75M9 21h6m-6-4h6m2.25 4.5v-12a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v12a.75.75 0 00.75.75h1.5a.75.75 0 00.75-.75z"
          />
        </svg>
      );
    case "Yahoo Finance":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 13.125h3.75v7.5H3v-7.5zm5.25-4.5h3.75V20.625H8.25V8.625zm5.25-4.5h3.75v16.5h-3.75V4.125zM18 9.75h3v11.25h-3V9.75z"
          />
        </svg>
      );
    case "Help":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.436.316-.686.396-.494.197-1.036.208-1.558.208H12M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100/80 dark:bg-zinc-950">
      <header className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-2 font-mono text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-[10px] font-bold text-white">
              K
            </span>
            kiteob
          </Link>
          <div className="hidden min-w-0 flex-1 sm:block">
            <label className="sr-only" htmlFor="dashboard-search">
              Search
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </span>
              <input
                id="dashboard-search"
                type="search"
                placeholder="Search orders, symbols, webhooks…"
                className="w-full max-w-xl rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                readOnly
                aria-readonly
              />
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            <KiteHeaderSession />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col md:flex-row md:items-stretch">
        <aside className="flex shrink-0 flex-col border-b border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:w-14 md:border-b-0 md:border-r">
          <nav
            className="flex h-full min-h-0 w-full justify-center gap-1 overflow-x-auto px-2 py-3 md:flex-col md:items-center md:justify-start md:px-0 md:py-4"
            aria-label="Main"
          >
            {primaryNav.map(({ href, label }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                >
                  <NavIcon name={label} />
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
