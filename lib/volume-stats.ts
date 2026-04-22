export type VolumeBarState = {
  index: number;
  volume: number;
  volSma: number | null;
  relVol: number | null;
};

/** SMA(volume) and volume / SMA for relative volume. */
export function volumeStatsSeries(
  volumes: number[],
  smaLength: number,
): VolumeBarState[] {
  const n = volumes.length;
  const len = Math.max(1, Math.floor(smaLength));
  const out: VolumeBarState[] = [];

  for (let i = 0; i < n; i++) {
    let volSma: number | null = null;
    if (i >= len - 1) {
      let sum = 0;
      for (let j = i - len + 1; j <= i; j++) sum += volumes[j]!;
      volSma = sum / len;
    }
    const v = volumes[i]!;
    const relVol =
      volSma !== null && volSma > 0 ? v / volSma : null;

    out.push({
      index: i,
      volume: v,
      volSma,
      relVol,
    });
  }

  return out;
}
