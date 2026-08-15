export interface Mp3Info {
  sampleRate: number | null;
  channels: number | null;
  durationSec: number | null;
}

const MPEG1_SR = [44100, 48000, 32000];
const MPEG2_SR = [22050, 24000, 16000];

function skipId3(bytes: Uint8Array): number {
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    return Math.min(bytes.length, 10 + size);
  }
  return 0;
}

function findFrame(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 4 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

/** Best-effort MPEG frame / Xing parse. Returns null if this is not an MP3. */
export function parseMp3Info(buf: ArrayBuffer): Mp3Info | null {
  const bytes = new Uint8Array(buf);
  const start = findFrame(bytes, skipId3(bytes));
  if (start < 0) return null;

  const b1 = bytes[start + 1];
  const b2 = bytes[start + 2];
  const b3 = bytes[start + 3];
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return null;

  const srTable = versionBits === 3 ? MPEG1_SR : MPEG2_SR;
  const sampleRate = srTable[(b2 >> 2) & 0x03] ?? null;
  const channelMode = (b3 >> 6) & 0x03;
  const channels = channelMode === 3 ? 1 : 2;

  const mpeg1 = versionBits === 3;
  const layer3 = layerBits === 1;
  const xingOffset = start + 4 + (mpeg1 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17);
  let durationSec: number | null = null;
  if (layer3 && sampleRate && xingOffset + 12 <= bytes.length) {
    const tag = String.fromCharCode(bytes[xingOffset], bytes[xingOffset + 1], bytes[xingOffset + 2], bytes[xingOffset + 3]);
    if (tag === "Xing" || tag === "Info") {
      const flags = (bytes[xingOffset + 4] << 24) | (bytes[xingOffset + 5] << 16) | (bytes[xingOffset + 6] << 8) | bytes[xingOffset + 7];
      if (flags & 0x01) {
        const frames =
          (bytes[xingOffset + 8] << 24) | (bytes[xingOffset + 9] << 16) | (bytes[xingOffset + 10] << 8) | bytes[xingOffset + 11];
        const samplesPerFrame = mpeg1 ? 1152 : 576;
        if (frames > 0) durationSec = (frames * samplesPerFrame) / sampleRate;
      }
    }
  }

  return { sampleRate, channels, durationSec };
}
