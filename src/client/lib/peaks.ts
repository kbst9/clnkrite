/** min/max int8 peak pairs @ ~50 px/s. Header: version u8, samplesPerPixel u16le. */
export const PEAKS_PX_PER_SEC = 50;

export interface PeakData {
  samplesPerPixel: number;
  pairs: number;
  min: Int8Array;
  max: Int8Array;
}

export function computePeaks(channelData: Float32Array, sampleRate: number, pxPerSec = PEAKS_PX_PER_SEC): ArrayBuffer {
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

export function parsePeaks(buf: ArrayBuffer): PeakData | null {
  if (buf.byteLength < 3) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== 1) return null;
  const samplesPerPixel = view.getUint16(1, true);
  if (samplesPerPixel <= 0) return null;
  const pairs = Math.floor((buf.byteLength - 3) / 2);
  const min = new Int8Array(pairs);
  const max = new Int8Array(pairs);
  for (let i = 0; i < pairs; i += 1) {
    min[i] = view.getInt8(3 + i * 2);
    max[i] = view.getInt8(3 + i * 2 + 1);
  }
  return { samplesPerPixel, pairs, min, max };
}

export function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: PeakData,
  width: number,
  height: number,
  cueInSec: number,
  lengthSec: number,
  color: string,
): void {
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0 || peaks.pairs === 0) return;
  ctx.fillStyle = color;
  const mid = height / 2;
  const start = Math.max(0, Math.floor(cueInSec * PEAKS_PX_PER_SEC));
  const count = Math.max(1, Math.ceil(Math.max(0.001, lengthSec) * PEAKS_PX_PER_SEC));
  for (let x = 0; x < width; x += 1) {
    const pair = start + Math.floor((x / width) * count);
    if (pair >= peaks.pairs) break;
    const mn = (peaks.min[pair] ?? 0) / 127;
    const mx = (peaks.max[pair] ?? 0) / 127;
    const y1 = mid - mx * mid;
    const y2 = mid - mn * mid;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}

export async function uploadPeaks(assetId: string, peaks: ArrayBuffer): Promise<void> {
  await fetch(`/api/assets/${assetId}/peaks`, { method: "PUT", body: peaks });
}

export async function fetchPeaks(assetId: string): Promise<PeakData | null> {
  const res = await fetch(`/api/assets/${assetId}/peaks`);
  if (!res.ok) return null;
  return parsePeaks(await res.arrayBuffer());
}

const cache = new Map<string, PeakData>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribePeaks(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCachedPeaks(assetId: string): PeakData | null {
  return cache.get(assetId) ?? null;
}

export function putCachedPeaks(assetId: string, data: PeakData): void {
  cache.set(assetId, data);
  notify();
}

export async function loadPeaksForAsset(assetId: string, peaksR2Key: string | null): Promise<PeakData | null> {
  const hit = cache.get(assetId);
  if (hit) return hit;
  if (!peaksR2Key) return null;
  const data = await fetchPeaks(assetId);
  if (data) putCachedPeaks(assetId, data);
  return data;
}
