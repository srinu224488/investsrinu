import Link from "next/link";

import { WebhooksEndpointsPanel } from "./WebhooksEndpointsPanel";

/**
 * Long-form TradingView / Kite webhook docs (linked from the dashboard webhook card).
 */
export default function WebhooksHelpView() {
  return (
    <div className="flex max-w-3xl flex-col gap-10 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <WebhooksEndpointsPanel />

      <section id="kite-postback" className="scroll-mt-8">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Kite postback (Zerodha order updates)
        </h2>
        <p className="mt-3">
          Register the HTTPS postback URL from the dashboard in Kite Connect. The
          app must be served over{" "}
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">
            HTTPS
          </strong>
          — local <span className="font-mono text-xs">http://localhost</span>{" "}
          URLs cannot be used as the live Kite postback. Set{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            KITE_POSTBACK_URL
          </code>{" "}
          to a tunneled HTTPS endpoint (e.g. ngrok) or deploy behind HTTPS.
        </p>
      </section>

      <section id="tradingview" className="scroll-mt-8">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          TradingView webhook
        </h2>
        <p className="mt-3">
          Use <span className="font-mono text-xs">POST</span> to your app&apos;s
          TradingView webhook URL with either:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
          <li>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Plain text
            </strong>{" "}
            — five fields separated by double underscores{" "}
            <span className="font-mono text-xs">__</span>:
            <code className="ml-1 block mt-2 w-fit rounded bg-zinc-100 px-2 py-1.5 font-mono text-xs dark:bg-zinc-800">
              {`{{ticker}}__{{strategy.order.action}}__{{strategy.order.price}}__{{interval}}__{{timenow}}`}
            </code>
          </li>
          <li>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              JSON
            </strong>{" "}
            — structured fields that map to Kite place-order parameters.
          </li>
        </ul>

        <h3 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Authentication
        </h3>
        <p className="mt-2">
          If a secret is configured (
          <span className="font-mono text-xs">TRADINGVIEW_WEBHOOK_SECRET</span>{" "}
          or MongoDB{" "}
          <span className="font-mono text-xs">kite_webhook_access.webhookSecret</span>
          ), send{" "}
          <span className="font-mono text-xs">Authorization: Bearer &lt;secret&gt;</span>{" "}
          on every request. For JSON bodies only, you may alternatively send{" "}
          <span className="font-mono text-xs">webhook_secret</span> in the JSON;
          it is stripped before events are stored.
        </p>

        <h3 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Live endpoint (store + place order)
        </h3>
        <p className="mt-2">
          The live URL persists each payload and attempts to place an order when
          mapping succeeds. You need{" "}
          <span className="font-mono text-xs">KITE_ACCESS_TOKEN</span>, or MongoDB
          plus opening this app in the browser while logged into Kite so the
          session token is synced for server-side webhooks.
        </p>
      </section>

      <section id="testing" className="scroll-mt-8">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Testing and cross-check
        </h2>
        <ul className="mt-3 list-disc space-y-3 pl-5">
          <li>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Live
            </strong>{" "}
            saves each payload server-side (e.g. webhook_events). Compare
            that row to the HTTP response (
            <span className="font-mono text-xs">data.order_id</span> vs{" "}
            <span className="font-mono text-xs">message</span>) and to Kite
            postbacks (or your broker UI) to confirm the order was accepted.
          </li>
          <li>
            One TradingView alert should correspond to one Kite order.{" "}
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Long
            </strong>{" "}
            is usually BUY to open and SELL to close;{" "}
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              short
            </strong>{" "}
            (e.g. MIS) is SELL to open and BUY to close. Your strategy must send the
            correct action each time — this app does not track position or flip
            direction for you.
          </li>
        </ul>
      </section>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        <Link
          href="/"
          className="text-teal-700 underline underline-offset-2 dark:text-teal-400"
        >
          Back to overview
        </Link>
      </p>
    </div>
  );
}
