/**
 * Merge Kite ticker LTP ticks into REST portfolio snapshots.
 * @see https://kite.trade/docs/connect/v3/websocket/ (binary quotes + order postbacks).
 */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Kite `multiplier` on positions/holdings (F&O / MCX lot size); omit or 0 → 1. */
function rowMultiplier(r: Record<string, unknown>): number {
  const m = num(r.multiplier);
  return m > 0 ? m : 1;
}

export type MutablePortfolioSnapshot = {
  holdings: unknown[];
  positions: { net: unknown[]; day: unknown[] };
};

export function clonePortfolioFromRest(
  holdings: unknown[] | null | undefined,
  positions: { net?: unknown[]; day?: unknown[] } | null | undefined,
): MutablePortfolioSnapshot {
  return {
    holdings: JSON.parse(JSON.stringify(holdings ?? [])) as unknown[],
    positions: {
      net: JSON.parse(JSON.stringify(positions?.net ?? [])) as unknown[],
      day: JSON.parse(JSON.stringify(positions?.day ?? [])) as unknown[],
    },
  };
}

export function instrumentTokensFromSnapshot(s: MutablePortfolioSnapshot): number[] {
  const out = new Set<number>();
  const add = (rows: unknown[]) => {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const t = num((row as Record<string, unknown>).instrument_token);
      if (t > 0) out.add(t >>> 0);
    }
  };
  add(s.holdings);
  add(s.positions.net);
  add(s.positions.day);
  return [...out];
}

/**
 * Mutates snapshot rows in place. Returns whether any field used in the UI changed.
 */
export function applyLtpTick(
  s: MutablePortfolioSnapshot,
  instrumentToken: number,
  ltpInr: number,
): boolean {
  const tok = instrumentToken >>> 0;
  let changed = false;

  for (const row of s.holdings) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if ((num(r.instrument_token) >>> 0) !== tok) continue;
    const q = num(r.quantity) + num(r.t1_quantity);
    const avg = num(r.average_price);
    const mult = rowMultiplier(r);
    r.last_price = ltpInr;
    r.pnl = (ltpInr - avg) * q * mult;
    const close = num(r.close_price);
    if (close > 0) {
      const dayCh = (ltpInr - close) * q * mult;
      r.day_change = dayCh;
      const prevVal = close * q * mult;
      r.day_change_percentage = Math.abs(prevVal) > 1e-12 ? (dayCh / prevVal) * 100 : 0;
    }
    changed = true;
  }

  const updatePos = (rows: unknown[]) => {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if ((num(r.instrument_token) >>> 0) !== tok) continue;
      const q = num(r.quantity);
      const mult = rowMultiplier(r);
      r.last_price = ltpInr;
      r.value = q * ltpInr * mult;
      const avg = num(r.average_price);
      r.unrealised = (ltpInr - avg) * q * mult;
      r.pnl = num(r.unrealised) + num(r.realised);
      const close = num(r.close_price);
      if (close > 0) {
        r.day_change_pct = ((ltpInr - close) / close) * 100;
      }
      changed = true;
    }
  };
  updatePos(s.positions.net);
  updatePos(s.positions.day);

  return changed;
}
