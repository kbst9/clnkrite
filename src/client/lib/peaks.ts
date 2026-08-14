/** min/max int8 peak pairs @ ~50 px/s. Header: version u8, samplesPerPixel u16le. */
export function computePeaks(channelData: Float32Array, sampleRate: number, pxPerSec = 50): ArrayBuffer {
  const samplesPerPixel = Math.max(1, Math.floor(sampleRate / pxPerSec));
  const pairs = Math.ceil(channelData.length / samplesPerPixel);
  const out = new ArrayBuffer(3 + pairs * 2);
  const view = new DataView(out);
  view.setUint8(0, 1);
  view.setUint16(1, samplesPerPixel, true);
  for (let i = 0; i < pairs; i += 1) {
    const start = i * samplesPerPixel;
    const end = Math.min(channelData.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;
    for (let s = start; s < end; s += 1) {
      const v = channelData[s] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    view.setInt8(3 + i * 2, Math.round(min * 127));
    view.setInt8(3 + i * 2 + 1, Math.round(max * 127));
  }
  return out;
}

export async function uploadPeaks(assetId: string, peaks: ArrayBuffer): Promise<void> {
  await fetch(`/api/assets/${assetId}/peaks`, { method: "PUT", body: peaks });
}
