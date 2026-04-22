import {
  forwardRef,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ProfileState } from "./types";

/** Kite sometimes returns `[label](url)` in `message` — render real links. */
function kiteMessageWithLinks(text: string): ReactNode[] {
  const re = /\[([^\]]*)]\((https?:[^)\s]+)\)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    out.push(
      <a
        key={`lnk-${k++}`}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-inherit underline underline-offset-2 hover:opacity-90"
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out.length > 0 ? out : [text];
}

const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";

const fieldClass =
  "h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/15";

type Props = {
  profile: ProfileState;
  busy: boolean;
  placeMsg: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

function placeMessageTone(msg: string): "ok" | "err" | "warn" | "neutral" {
  if (msg.startsWith("Placed.")) return "ok";
  const lower = msg.toLowerCase();
  if (
    lower.includes("markets are closed") ||
    lower.includes("market is closed")
  ) {
    return "warn";
  }
  if (
    lower.includes("fail") ||
    lower.includes("error") ||
    lower.includes("invalid") ||
    lower.includes("incorrect")
  ) {
    return "err";
  }
  return "neutral";
}

export const KitePlaceOrderSection = forwardRef<HTMLFormElement, Props>(
  function KitePlaceOrderSection(
    { profile, busy, placeMsg, onSubmit },
    ref,
  ) {
    const msgTone = placeMsg ? placeMessageTone(placeMsg) : null;

    return (
      <section className="rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/80 p-4 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-950/90">
        <div className="border-b border-zinc-200/80 pb-3 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            Place order
          </h2>
          <p className="mt-1.5 max-w-xl text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
            Uses your live session. Double-check symbol and product before
            submitting.
          </p>
        </div>
        <form
          ref={ref}
          className="mt-4 grid gap-3 text-sm"
          onSubmit={onSubmit}
        >
          <label className="grid gap-1">
            <span className={labelClass}>Symbol</span>
            <input
              name="tradingsymbol"
              required
              placeholder="e.g. INFY"
              autoComplete="off"
              className={fieldClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>Exchange</span>
              <select name="exchange" className={fieldClass}>
                <option>NSE</option>
                <option>BSE</option>
                <option>NFO</option>
                <option>MCX</option>
                <option>BFO</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Variety</span>
              <select name="variety" className={fieldClass}>
                <option value="regular">regular</option>
                <option value="amo">amo</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <span className={labelClass}>Side</span>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="transaction_type"
                    value="BUY"
                    defaultChecked
                    className="peer sr-only"
                  />
                  <span className="flex h-8 items-center justify-center rounded-md border border-zinc-200 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-800 dark:border-zinc-700 dark:text-zinc-400 peer-checked:dark:border-emerald-500/80 peer-checked:dark:bg-emerald-950/50 peer-checked:dark:text-emerald-200">
                    Buy
                  </span>
                </label>
                <label className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="transaction_type"
                    value="SELL"
                    className="peer sr-only"
                  />
                  <span className="flex h-8 items-center justify-center rounded-md border border-zinc-200 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors peer-checked:border-rose-500 peer-checked:bg-rose-50 peer-checked:text-rose-900 dark:border-zinc-700 dark:text-zinc-400 peer-checked:dark:border-rose-500/80 peer-checked:dark:bg-rose-950/50 peer-checked:dark:text-rose-200">
                    Sell
                  </span>
                </label>
              </div>
            </div>
            <label className="grid gap-1">
              <span className={labelClass}>Quantity</span>
              <input
                name="quantity"
                type="number"
                min={1}
                required
                defaultValue={1}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>Product</span>
              <select name="product" className={fieldClass}>
                <option>CNC</option>
                <option>MIS</option>
                <option>NRML</option>
                <option>MTF</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Order type</span>
              <select name="order_type" className={fieldClass}>
                <option>MARKET</option>
                <option>LIMIT</option>
                <option>SL</option>
                <option>SL-M</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1">
            <span className={labelClass}>
              Market protection (MARKET / SL-M only)
            </span>
            <input
              name="market_protection"
              type="number"
              step={1}
              min={-1}
              max={100}
              placeholder="-1 = auto (recommended)"
              className={fieldClass}
            />
            <span className="text-[10px] text-zinc-500 dark:text-zinc-500">
              Kite: -1 auto, 0 none, 1–100 percent. Ignored for LIMIT / SL.
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>Price (limit / SL)</span>
              <input
                name="price"
                type="number"
                step="any"
                placeholder="—"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Trigger (SL)</span>
              <input
                name="trigger_price"
                type="number"
                step="any"
                placeholder="—"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="grid gap-1">
            <span className={labelClass}>Validity</span>
            <select name="validity" className={fieldClass}>
              <option>DAY</option>
              <option>IOC</option>
              <option>TTL</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className={labelClass}>Tag (optional)</span>
            <input
              name="tag"
              maxLength={20}
              placeholder="Optional order tag"
              className={fieldClass}
            />
          </label>

          <button
            type="submit"
            disabled={!profile?.connected || busy}
            className="h-9 w-full rounded-md bg-zinc-900 text-xs font-semibold tracking-wide text-white shadow-md transition-[opacity,transform] hover:bg-zinc-800 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {busy ? "Placing…" : "Place order"}
          </button>

          {placeMsg ? (
            <p
              role="status"
              className={
                msgTone === "ok"
                  ? "break-words rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : msgTone === "err"
                    ? "break-words rounded-lg border border-red-200/80 bg-red-50/90 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
                    : msgTone === "warn"
                      ? "break-words rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100"
                      : "break-words rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200"
              }
            >
              {kiteMessageWithLinks(placeMsg)}
            </p>
          ) : null}
        </form>
      </section>
    );
  },
);
