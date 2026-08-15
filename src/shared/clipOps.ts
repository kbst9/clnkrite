import { beatsToSec, secToBeats } from "./beats";
import type { Clip } from "./types";

export function snapBeats(beats: number, grid: number, bypass = false): number {
  if (bypass || grid <= 0) return beats;
  return Math.round(beats / grid) * grid;
}

export function clipEnd(clip: Pick<Clip, "startBeats" | "lengthBeats">): number {
  return clip.startBeats + clip.lengthBeats;
}

export function constrainAudioClip(clip: Clip, bpm: number, assetDurationSec: number | null): Clip {
  if (assetDurationSec == null || clip.assetId == null) {
    return { ...clip, startBeats: Math.max(0, clip.startBeats), lengthBeats: Math.max(0.001, clip.lengthBeats) };
  }
  const cueInSec = Math.max(0, Math.min(clip.cueInSec, assetDurationSec));
  const maxLenSec = Math.max(0.001, assetDurationSec - cueInSec);
  const maxLenBeats = secToBeats(maxLenSec, bpm);
  const lengthBeats = Math.min(Math.max(0.001, clip.lengthBeats), maxLenBeats);
  return { ...clip, startBeats: Math.max(0, clip.startBeats), cueInSec, lengthBeats };
}

export function moveClip(clip: Clip, startBeats: number, grid = 0.25, bypassSnap = false): Clip {
  return { ...clip, startBeats: Math.max(0, snapBeats(startBeats, grid, bypassSnap)) };
}

export function cropClip(
  clip: Clip,
  edge: "start" | "end",
  beats: number,
  bpm: number,
  assetDurationSec: number | null,
  grid = 0.25,
  bypassSnap = false,
): Clip {
  const snapped = Math.max(0, snapBeats(beats, grid, bypassSnap));
  if (edge === "start") {
    const end = clipEnd(clip);
    const startBeats = Math.min(snapped, end - 0.001);
    const deltaBeats = startBeats - clip.startBeats;
    const cueInSec = Math.max(0, clip.cueInSec + beatsToSec(deltaBeats, bpm));
    return constrainAudioClip({ ...clip, startBeats, lengthBeats: end - startBeats, cueInSec }, bpm, assetDurationSec);
  }
  return constrainAudioClip({ ...clip, lengthBeats: Math.max(0.001, snapped - clip.startBeats) }, bpm, assetDurationSec);
}

export function slipClip(clip: Clip, cueInSec: number, bpm: number, assetDurationSec: number | null): Clip {
  return constrainAudioClip({ ...clip, cueInSec: Math.max(0, cueInSec) }, bpm, assetDurationSec);
}

export function nudgeClip(clip: Clip, direction: -1 | 1, grid = 0.25): Clip {
  return { ...clip, startBeats: Math.max(0, clip.startBeats + direction * grid) };
}

export function setFades(clip: Clip, fadeInSec: number, fadeOutSec: number): Clip {
  return { ...clip, fadeInSec: Math.max(0, fadeInSec), fadeOutSec: Math.max(0, fadeOutSec) };
}

export function copyClip(clip: Clip, newId: string, startBeats: number): Clip {
  const t = Date.now();
  return { ...clip, id: newId, startBeats: Math.max(0, startBeats), createdAt: t, updatedAt: t };
}

/** Split at a timeline position. Second clip gets the remaining source via cue_in_sec. */
export function splitClip(clip: Clip, atBeats: number, bpm: number, newId: string): [Clip, Clip] | null {
  const end = clipEnd(clip);
  if (atBeats <= clip.startBeats || atBeats >= end) return null;
  const t = Date.now();
  const leftLen = atBeats - clip.startBeats;
  const left: Clip = { ...clip, lengthBeats: leftLen, updatedAt: t };
  const right: Clip = {
    ...clip,
    id: newId,
    startBeats: atBeats,
    lengthBeats: end - atBeats,
    cueInSec: clip.cueInSec + beatsToSec(leftLen, bpm),
    createdAt: t,
    updatedAt: t,
  };
  return [left, right];
}

/** Overlaps within a lane are allowed — the mixer sums them. */
export function overlaysAllowed(): boolean {
  return true;
}
