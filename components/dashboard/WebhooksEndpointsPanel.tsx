"use client";

import { useEffect, useState } from "react";
import { fetchPostbackUrl } from "./kite-fetch";

/**
 * Resolves Kite postback + TradingView URLs for the current deployment (same logic as the former dashboard card).
 */
export function WebhooksEndpointsPanel() {
  const [kiteUrl, setKiteUrl] = useState<string>("");
  const [fromEnv, setFromEnv] = useState(false);
  const [tvLine, setTvLine] = useState<string>("");

  useEffect(() => {
    const origin = window.location.origin;
    setTvLine(`POST ${origin}/api/webhooks/tradingview`);
    void fetchPostbackUrl().then((j) => {
      if (typeof j.url === "string" && j.url.length > 0) {
        setKiteUrl(j.url);
        setFromEnv(Boolean(j.fromEnv));
      }
    });
  }, []);

  const postbackNotHttps =
    kiteUrl.length > 0 && !kiteUrl.startsWith("https:");

  return (
    <section id="endpoints" className="scroll-mt-8">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Your webhook URLs
      </h2>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        Use these values in Kite Connect and TradingView for this deployment.
      </p>

      {postbackNotHttps ? (
        <p
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          This Kite postback URL is not HTTPS — you cannot use it as the live
          Kite postback. Set{" "}
          <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">
            KITE_POSTBACK_URL
          </code>{" "}
          to your tunneled HTTPS endpoint, or deploy behind HTTPS.
        </p>
      ) : null}

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Kite postback
        </p>
        {fromEnv ? (
          <p className="mt-1 text-xs text-zinc-500">
            From <span className="font-mono">KITE_POSTBACK_URL</span> (register in
            Kite).
          </p>
        ) : null}
        <code className="mt-2 block break-all rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {kiteUrl || "…"}
        </code>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          TradingView webhook
        </p>
        <code className="mt-2 block break-all rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {tvLine || "…"}
        </code>
      </div>
    </section>
  );
}
