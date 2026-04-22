/**
 * Client-side grouping and chip filters for Kite positions (net / day), similar to Kite’s
 * positions settings panel.
 */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function kitePositionIsActiveBook(row: Record<string, unknown>): boolean {
  return num(row.quantity) !== 0;
}

export type PositionGrouping = "none" | "underlying" | "underlying_expiry";

export type PositionChipFilters = {
  nrml: boolean;
  eq: boolean;
  long: boolean;
  overnight: boolean;
  short: boolean;
  mcx: boolean;
  nfo: boolean;
  nse: boolean;
  open: boolean;
  closed: boolean;
};

export const defaultPositionChipFilters = (): PositionChipFilters => ({
  nrml: false,
  eq: false,
  long: false,
  overnight: false,
  short: false,
  mcx: false,
  nfo: false,
  nse: false,
  open: false,
  closed: false,
});

export function parsePositionRows(raw: unknown[] | undefined): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => Boolean(r));
}

function underlyingLetters(sym: string): string {
  const m = sym.match(/^([A-Za-z]+)/);
  return (m?.[1] ?? "").toUpperCase() || sym;
}

function expiryToken(sym: string): string {
  const m = sym.match(/\d{2}[A-Z]{3}/);
  return m?.[0] ?? "";
}

export function positionGroupingKey(row: Record<string, unknown>, mode: PositionGrouping): string {
  const sym = String(row.tradingsymbol ?? "");
  if (mode === "none") return "";
  const base = underlyingLetters(sym) || sym;
  if (mode === "underlying") return base;
  const exp = expiryToken(sym);
  return exp ? `${base} · ${exp}` : base;
}

export function filterPositionRows(
  rows: Record<string, unknown>[],
  chips: PositionChipFilters,
): Record<string, unknown>[] {
  return rows.filter((row) => passesChips(row, chips));
}

function passesChips(row: Record<string, unknown>, chips: PositionChipFilters): boolean {
  const active = kitePositionIsActiveBook(row);
  const openSel = chips.open;
  const closedSel = chips.closed;
  if (openSel && !closedSel) {
    if (!active) return false;
  } else if (!openSel && closedSel) {
    if (active) return false;
  } else if (!openSel && !closedSel) {
    if (!active) return false;
  }

  if (chips.nrml && String(row.product ?? "").toUpperCase() !== "NRML") return false;

  if (chips.eq) {
    const p = String(row.product ?? "").toUpperCase();
    if (p !== "EQ" && p !== "CNC") return false;
  }

  const ex = String(row.exchange ?? "").toUpperCase();
  const exWant: string[] = [];
  if (chips.mcx) exWant.push("MCX");
  if (chips.nfo) exWant.push("NFO");
  if (chips.nse) exWant.push("NSE");
  if (exWant.length > 0 && !exWant.includes(ex)) return false;

  const sideOn = chips.long || chips.short || chips.overnight;
  if (sideOn) {
    const q = num(row.quantity);
    const oq = num(row.overnight_quantity);
    const okLong = chips.long && q > 0;
    const okShort = chips.short && q < 0;
    const okOvn = chips.overnight && oq !== 0;
    if (!okLong && !okShort && !okOvn) return false;
  }

  return true;
}

export type PositionGroup = { group: string | null; rows: Record<string, unknown>[] };

export function buildPositionGroups(rows: Record<string, unknown>[], mode: PositionGrouping): PositionGroup[] {
  if (mode === "none") {
    const sorted = [...rows].sort((a, b) =>
      String(a.tradingsymbol ?? "").localeCompare(String(b.tradingsymbol ?? "")),
    );
    return [{ group: null, rows: sorted }];
  }
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const k = positionGroupingKey(row, mode);
    const arr = map.get(k) ?? [];
    arr.push(row);
    map.set(k, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.tradingsymbol ?? "").localeCompare(String(b.tradingsymbol ?? "")));
  }
  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));
  return keys.map((k) => ({ group: k, rows: map.get(k)! }));
}

export function sumPositionTotals(rows: Record<string, unknown>[]) {
  let unrealised = 0;
  let realised = 0;
  let pnl = 0;
  for (const r of rows) {
    unrealised += num(r.unrealised);
    realised += num(r.realised);
    pnl += num(r.pnl);
  }
  return { unrealised, realised, pnl };
}
