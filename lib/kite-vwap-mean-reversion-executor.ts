export type Side = "LONG" | "SHORT";
export type Txn = "BUY" | "SELL";

export type OhlcvBar = {
  timestamp: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: unknown;
};

export type PositionState = {
  side: Side | null;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  entryIndex: number;
  entryOrderId: string | null;
};

export type PlaceOrderInput = {
  variety: string;
  exchange: string;
  tradingsymbol: string;
  transaction_type: Txn;
  quantity: number;
  order_type: "MARKET";
  product: string;
  validity: "DAY";
};

export type KiteOrderClient = {
  placeOrder(input: PlaceOrderInput): Promise<string>;
  historicalData(input: {
    instrument_token: number;
    from_date: Date | string;
    to_date: Date | string;
    interval: string;
    continuous: boolean;
    oi: boolean;
  }): Promise<unknown[]>;
};

export type StrategySignalRow = OhlcvBar & {
  vwap?: number;
  sd?: number;
  "-1"?: number;
  sig_rubber_long?: boolean;
  sig_rubber_short?: boolean;
  sig_trend_rej_short?: boolean;
  sig_bandwalk_fail_short?: boolean;
};

export type VwapSignalPipeline = (bars: OhlcvBar[]) => StrategySignalRow[];

export type VwapExecutorConfig = {
  kiteClient: KiteOrderClient;
  instrumentToken: number;
  tradingsymbol: string;
  signalPipeline: VwapSignalPipeline;
  exchange?: string;
  product?: string;
  quantity?: number;
  maxHoldBars?: number;
  slSdMult?: number;
};

function flatPosition(): PositionState {
  return {
    side: null,
    entryPrice: 0,
    stopPrice: 0,
    targetPrice: 0,
    entryIndex: -1,
    entryOrderId: null,
  };
}

function toNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function toBool(v: unknown): boolean {
  return v === true;
}

export class VwapMeanReversionExecutor {
  private readonly kite: KiteOrderClient;
  private readonly instrumentToken: number;
  private readonly tradingsymbol: string;
  private readonly exchange: string;
  private readonly product: string;
  private readonly quantity: number;
  private readonly maxHoldBars: number;
  private readonly slSdMult: number;
  private readonly signalPipeline: VwapSignalPipeline;

  private pos: PositionState = flatPosition();

  constructor(cfg: VwapExecutorConfig) {
    this.kite = cfg.kiteClient;
    this.instrumentToken = cfg.instrumentToken;
    this.tradingsymbol = cfg.tradingsymbol;
    this.signalPipeline = cfg.signalPipeline;
    this.exchange = cfg.exchange ?? "NFO";
    this.product = cfg.product ?? "MIS";
    this.quantity = cfg.quantity ?? 15;
    this.maxHoldBars = cfg.maxHoldBars ?? 10;
    this.slSdMult = cfg.slSdMult ?? 0.8;
  }

  get position(): Readonly<PositionState> {
    return this.pos;
  }

  async placeMarketOrder(transactionType: Txn): Promise<string> {
    return this.kite.placeOrder({
      variety: "regular",
      exchange: this.exchange,
      tradingsymbol: this.tradingsymbol,
      transaction_type: transactionType,
      quantity: this.quantity,
      order_type: "MARKET",
      product: this.product,
      validity: "DAY",
    });
  }

  async fetchLiveOhlcv(
    fromDt: Date | string,
    toDt: Date | string,
    interval = "5minute",
  ): Promise<OhlcvBar[]> {
    const raw = await this.kite.historicalData({
      instrument_token: this.instrumentToken,
      from_date: fromDt,
      to_date: toDt,
      interval,
      continuous: false,
      oi: false,
    });
    return raw
      .map((r) => this.normalizeHistoricalRow(r))
      .filter((r): r is OhlcvBar => r !== null);
  }

  computeSignalFrame(bars: OhlcvBar[]): StrategySignalRow[] {
    return this.signalPipeline(bars);
  }

  async onNewCandle(signalRows: StrategySignalRow[]): Promise<void> {
    if (signalRows.length === 0) return;
    const idx = signalRows.length - 1;
    const row = signalRows[idx]!;

    await this.manageOpenPosition(row, idx);
    if (this.pos.side !== null) return;

    const longSignal = toBool(row.sig_rubber_long);
    const shortSignal =
      toBool(row.sig_rubber_short) ||
      toBool(row.sig_trend_rej_short) ||
      toBool(row.sig_bandwalk_fail_short);

    if (longSignal && !shortSignal) {
      await this.openLong(row, idx);
      return;
    }
    if (shortSignal && !longSignal) {
      await this.openShort(row, idx);
    }
  }

  private normalizeHistoricalRow(row: unknown): OhlcvBar | null {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const r = row as Record<string, unknown>;
    const timestamp = r.date ?? r.timestamp;
    if (!timestamp) return null;
    const open = toNumber(r.open, Number.NaN);
    const high = toNumber(r.high, Number.NaN);
    const low = toNumber(r.low, Number.NaN);
    const close = toNumber(r.close, Number.NaN);
    const volume = toNumber(r.volume, Number.NaN);
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      return null;
    }
    return { timestamp: String(timestamp), open, high, low, close, volume };
  }

  private async openLong(row: StrategySignalRow, idx: number): Promise<void> {
    const ltp = toNumber(row.close);
    const sd = toNumber(row.sd, 0);
    const vwap = toNumber(row.vwap, ltp);
    const stop = ltp - Math.max(0.05, this.slSdMult * sd);
    const target = vwap;
    const oid = await this.placeMarketOrder("BUY");
    this.pos = {
      side: "LONG",
      entryPrice: ltp,
      stopPrice: stop,
      targetPrice: target,
      entryIndex: idx,
      entryOrderId: oid,
    };
  }

  private async openShort(row: StrategySignalRow, idx: number): Promise<void> {
    const ltp = toNumber(row.close);
    const sd = toNumber(row.sd, 0);
    const vwap = toNumber(row.vwap, ltp);
    const stop = ltp + Math.max(0.05, this.slSdMult * sd);
    let target = vwap;
    if (toBool(row.sig_bandwalk_fail_short) && Number.isFinite(toNumber(row["-1"], Number.NaN))) {
      target = toNumber(row["-1"], vwap);
    }
    const oid = await this.placeMarketOrder("SELL");
    this.pos = {
      side: "SHORT",
      entryPrice: ltp,
      stopPrice: stop,
      targetPrice: target,
      entryIndex: idx,
      entryOrderId: oid,
    };
  }

  private async closePosition(): Promise<void> {
    if (this.pos.side === "LONG") {
      await this.placeMarketOrder("SELL");
    } else if (this.pos.side === "SHORT") {
      await this.placeMarketOrder("BUY");
    }
    this.pos = flatPosition();
  }

  private async manageOpenPosition(row: StrategySignalRow, idx: number): Promise<void> {
    if (this.pos.side === null) return;
    const high = toNumber(row.high);
    const low = toNumber(row.low);

    if (idx - this.pos.entryIndex >= this.maxHoldBars) {
      await this.closePosition();
      return;
    }

    if (this.pos.side === "LONG") {
      const stopHit = low <= this.pos.stopPrice;
      const targetHit = high >= this.pos.targetPrice;
      if (stopHit || targetHit) await this.closePosition();
      return;
    }

    const stopHit = high >= this.pos.stopPrice;
    const targetHit = low <= this.pos.targetPrice;
    if (stopHit || targetHit) await this.closePosition();
  }
}
