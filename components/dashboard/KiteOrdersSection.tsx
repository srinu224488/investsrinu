import type { SymbolChargeBreakdown } from "@/lib/kite-order-charges";

import type { OrderRow, ProfileState } from "./types";

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Average fill when traded; otherwise limit / order price when present. */
function orderPriceCell(o: OrderRow): { text: string; title: string } {
  const avg = num(o.average_price);
  if (avg != null && avg > 0) {
    return {
      text: avg.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
      title: "Average traded price",
    };
  }
  const p = num(o.price);
  if (p != null && p > 0) {
    return {
      text: p.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
      title: "Order price (limit / trigger)",
    };
  }
  return { text: "—", title: "Price" };
}

function sideBadgeClass(tx: string): string {
  const u = tx.trim().toUpperCase();
  if (u === "BUY") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100";
  }
  if (u === "SELL") {
    return "bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-100";
  }
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

/** Text color only for terminal statuses (no background). */
function orderStatusSegmentClass(raw: string): string | undefined {
  const u = raw.trim().toUpperCase();
  if (u === "COMPLETE") {
    return "font-semibold text-green-600 dark:text-green-400";
  }
  if (u === "REJECTED") {
    return "font-semibold text-red-600 dark:text-red-400";
  }
  return undefined;
}

type Props = {
  profile: ProfileState;
  orders: OrderRow[];
  ordersErr: string | null;
  chargeTotals: Record<string, SymbolChargeBreakdown> | null;
  chargesErr: string | null;
  onRefreshOrders: () => void | Promise<void>;
};

function ChargesBySymbolTable({
  chargeTotals,
}: {
  chargeTotals: Record<string, SymbolChargeBreakdown>;
}) {
  const rows = Object.entries(chargeTotals).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const showOther = rows.some(([, v]) => v.other > 0);

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Total charges by symbol
      </h3>
      <p className="mt-1 text-[11px] text-zinc-500">
        From Kite{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
          /charges/orders
        </code>{" "}
        (executed orders with average price only). Buy and sell columns use each
        order&apos;s <span className="font-mono">transaction_type</span>.
      </p>
      <table className="mt-2 w-full min-w-[360px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="pb-2 pr-2 font-medium">Symbol</th>
            <th className="pb-2 pr-2 font-medium">Buy (₹)</th>
            <th className="pb-2 pr-2 font-medium">Sell (₹)</th>
            {showOther ? (
              <th className="pb-2 pr-2 font-medium">Other (₹)</th>
            ) : null}
            <th className="pb-2 font-medium">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([sym, v]) => (
            <tr
              key={sym}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-2 pr-2">{sym}</td>
              <td className="py-2 pr-2 font-mono tabular-nums">{v.buy.toFixed(2)}</td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {v.sell.toFixed(2)}
              </td>
              {showOther ? (
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {v.other.toFixed(2)}
                </td>
              ) : null}
              <td className="py-2 font-mono tabular-nums">{v.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KiteOrdersSection({
  profile,
  orders,
  ordersErr,
  chargeTotals,
  chargesErr,
  onRefreshOrders,
}: Props) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Orders
        </h2>
        <button
          type="button"
          onClick={() => void onRefreshOrders()}
          disabled={!profile?.connected}
          className="rounded-lg border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-zinc-600"
        >
          Refresh
        </button>
      </div>
      {!profile?.connected ? (
        <p className="mt-4 text-sm text-zinc-500">Connect Kite to load orders.</p>
      ) : ordersErr ? (
        <p className="mt-4 text-sm text-red-600">{ordersErr}</p>
      ) : orders.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No orders returned.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 font-medium">Symbol</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => {
                const side = String(o.transaction_type ?? "").trim();
                const sideU = side.toUpperCase();
                const price = orderPriceCell(o);
                const orderType = String(o.order_type ?? "—");
                const orderStatus = String(o.status ?? "—");
                const metaParts = [
                  {
                    key: "id",
                    title: "Order id",
                    content: String(o.order_id ?? "—"),
                    breakAll: true,
                  },
                  {
                    key: "price",
                    title: price.title,
                    content: price.text,
                    breakAll: false,
                  },
                  {
                    key: "qty",
                    title: "Quantity",
                    content: String(o.quantity ?? "—"),
                    breakAll: false,
                  },
                ] as const;
                return (
                <tr
                  key={`${String(o.order_id ?? "o")}-${idx}`}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 align-top">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="font-medium">
                        {String(o.tradingsymbol ?? "")}
                      </span>
                      <span
                        className={`inline-flex min-w-[2.25rem] shrink-0 justify-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${sideBadgeClass(side)}`}
                        title="Side"
                      >
                        {sideU || "—"}
                      </span>
                      <span
                        className="font-mono text-[10px] leading-tight text-zinc-500"
                        title="Order type"
                      >
                        {orderType}
                      </span>
                      <span
                        title="Status"
                        className={
                          [
                            "font-mono text-[10px] leading-tight",
                            orderStatusSegmentClass(orderStatus) ??
                              "text-zinc-500",
                          ].join(" ")
                        }
                      >
                        {orderStatus}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] leading-tight text-zinc-500">
                      {metaParts.map((p, i) => (
                        <span key={p.key}>
                          {i > 0 ? (
                            <span className="text-zinc-400" aria-hidden>
                              {" "}
                              |{" "}
                            </span>
                          ) : null}
                          <span
                            title={p.title}
                            className={p.breakAll ? "break-all" : undefined}
                          >
                            {p.content}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {chargesErr ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Charges (virtual contract note) could not be loaded: {chargesErr}
            </p>
          ) : chargeTotals && Object.keys(chargeTotals).length > 0 ? (
            <ChargesBySymbolTable chargeTotals={chargeTotals} />
          ) : profile?.connected && orders.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-500">
              No executed orders with a non-zero average price — nothing to sum
              for charges.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
