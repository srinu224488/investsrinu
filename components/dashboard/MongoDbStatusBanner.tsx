"use client";

import { useCallback, useEffect, useState } from "react";

type MongoStatusPayload =
  | {
      configured: boolean;
      connected: boolean;
      database?: string;
      error?: string;
    }
  | { error: string };

export default function MongoDbStatusBanner() {
  const [bad, setBad] = useState<{ message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/kite/mongodb-status", { cache: "no-store" });
      if (r.status === 401) {
        setBad(null);
        return;
      }
      const j = (await r.json()) as MongoStatusPayload;
      if ("error" in j && j.error === "not_connected") {
        setBad(null);
        return;
      }
      if ("configured" in j && j.configured && !j.connected) {
        const msg =
          j.error?.trim() ||
          "MongoDB is configured but not reachable (check Atlas network access and cluster state).";
        setBad({ message: msg });
        return;
      }
      setBad(null);
    } catch {
      setBad(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (!bad) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-b border-amber-800/80 bg-amber-950/90 px-4 py-2 text-sm text-amber-100 dark:bg-amber-950/95"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-start gap-x-3 gap-y-1">
        <span className="font-semibold text-amber-50">MongoDB connection failed</span>
        <span className="min-w-0 flex-1 font-mono text-xs text-amber-200/95" title={bad.message}>
          {bad.message}
        </span>
      </div>
    </div>
  );
}
