/**
 * Kite Connect v3 ticker binary frames — see
 * https://www.kite.trade/docs/connect/v3/websocket/ (binary market data).
 *
 * All multi-byte fields are **big-endian** (matches zerodha/pykiteconnect `struct.unpack(">…")`).
 * Packet framing: uint16 BE packet count, then per packet uint16 BE length + payload.
 */

export type KiteWsQuoteTick = {
  instrumentToken: number;
  /** Raw uint32 price field from bytes 4–8 (scale depends on segment). */
  lastPriceRaw: number;
};

const MAX_PACKETS = 512;

/** Segment is the low byte of `instrument_token` (pykiteconnect EXCHANGE_MAP). */
const SEG_CDS = 3;
const SEG_BCD = 6;

/**
 * Parse one WebSocket binary message into LTP ticks (ignores JSON text postbacks).
 */
export function parseKiteTickerBinaryTicks(data: Buffer): KiteWsQuoteTick[] {
  if (data.length <= 1) return [];

  const first = data[0];
  if (first === 0x7b || first === 0x5b) return [];

  if (data.length < 4) return [];

  const nPackets = data.readUInt16BE(0);
  if (nPackets === 0 || nPackets > MAX_PACKETS) return [];

  let off = 2;
  const out: KiteWsQuoteTick[] = [];

  for (let p = 0; p < nPackets && off + 2 <= data.length; p++) {
    const pktLen = data.readUInt16BE(off);
    off += 2;
    if (pktLen < 8 || off + pktLen > data.length) break;
    const pkt = data.subarray(off, off + pktLen);
    off += pktLen;
    const instrumentToken = pkt.readUInt32BE(0);
    const lastPriceRaw = pkt.readUInt32BE(4);
    out.push({ instrumentToken, lastPriceRaw });
  }

  return out;
}

/**
 * Convert raw tick price to rupees (same divisor rules as pykiteconnect ticker).
 */
export function kiteTickRawToInr(raw: number, instrumentToken: number): number {
  const seg = instrumentToken & 0xff;
  if (seg === SEG_CDS) return raw / 10000000;
  if (seg === SEG_BCD) return raw / 10000;
  return raw / 100;
}
