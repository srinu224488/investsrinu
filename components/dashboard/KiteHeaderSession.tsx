"use client";

import Link from "next/link";
import { useKiteSession } from "./KiteSessionProvider";

function profileInitials(userName: string | undefined, userId: string | undefined): string {
  const base = (userName ?? userId ?? "?").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export default function KiteHeaderSession() {
  const { profile, logout, isLoggingOut } = useKiteSession();

  if (profile === null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="sr-only">Checking session…</span>
        <span
          className="inline-flex size-9 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700"
          aria-hidden
        />
      </span>
    );
  }

  if (profile.connected && profile.profile) {
    const p = profile.profile;
    const initials = profileInitials(p.user_name, p.user_id);
    const label = p.user_name ?? p.user_id ?? "Kite account";

    return (
      <div className="group relative flex items-center">
        <button
          type="button"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white ring-2 ring-transparent transition hover:bg-teal-500 focus:outline-none focus-visible:ring-teal-400/80"
          aria-label={`${label}, Kite session active, account menu`}
          aria-haspopup="true"
        >
          {initials}
          <span
            className="pointer-events-none absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-sm ring-1 ring-emerald-600/40 dark:border-zinc-900 dark:bg-emerald-500 dark:ring-emerald-400/30"
            title="Session active"
            aria-hidden
          />
        </button>
        <div
          className="pointer-events-none invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-[opacity,visibility] duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100"
          role="region"
          aria-label="Kite account"
        >
          <div className="w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-900">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Kite Connect
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {p.user_name ?? p.user_id}
            </p>
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
              {p.user_id} · {p.broker}
            </p>
            {p.email ? (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-500">{p.email}</p>
            ) : null}
            <Link
              href="/profile"
              className="mt-3 block w-full rounded-lg bg-teal-600 py-2 text-center text-xs font-medium text-white hover:bg-teal-500"
            >
              Holdings &amp; positions
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isLoggingOut}
              className="mt-2 w-full rounded-lg border border-zinc-300 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-500 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <a
      href="/api/kite/login"
      className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:text-sm"
    >
      Connect Zerodha
    </a>
  );
}
