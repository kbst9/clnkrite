/** Beats are the storage/timeline unit. Seconds are derived from project BPM. */
export function beatsToSec(beats: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (beats / bpm) * 60;
}

export function secToBeats(sec: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (sec / 60) * bpm;
}

export function beatsPerBar(timeSig: string): number {
  const [num] = timeSig.split("/").map(Number);
  return Number.isFinite(num) && num > 0 ? num : 4;
}

export function formatPlayhead(beats: number, timeSig = "4/4"): string {
  const perBar = beatsPerBar(timeSig);
  const total = Math.max(0, beats);
  const bar = Math.floor(total / perBar) + 1;
  const beat = Math.floor(total % perBar) + 1;
  const frac = total % 1;
  const ticks = Math.floor(frac * 100)
    .toString()
    .padStart(2, "0");
  return `${bar}.${beat}.${ticks}`;
}
