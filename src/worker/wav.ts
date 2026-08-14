export interface WavInfo {
  sampleRate: number;
  channels: number;
  durationSec: number;
}

/** Minimal RIFF/WAVE header parse. Returns null if the buffer is not a WAV. */
export function parseWavHeader(buf: ArrayBuffer): WavInfo | null {
  if (buf.byteLength < 44) return null;
  const view = new DataView(buf);
  const tag = (offset: number, n: number) =>
    String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(offset + i)));
  if (tag(0, 4) !== "RIFF" || tag(8, 4) !== "WAVE") return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 16;
  let dataBytes = 0;

  while (offset + 8 <= view.byteLength) {
    const id = tag(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitsPerSample = view.getUint16(start + 14, true);
    } else if (id === "data") {
      dataBytes = size;
    }
    offset = start + size + (size % 2);
  }

  if (!sampleRate || !channels || !dataBytes) return null;
  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const durationSec = dataBytes / (sampleRate * channels * bytesPerSample);
  return { sampleRate, channels, durationSec };
}
