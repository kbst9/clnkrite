import type { SynthConfig, SynthNote, SynthType } from "./types";

export const SYNTH_TYPES: SynthType[] = ["PolySynth", "MonoSynth", "FMSynth", "MembraneSynth"];

export function defaultSynthConfig(): SynthConfig {
  return { type: "PolySynth" };
}

export function parseSynthConfig(raw: string | null | undefined): SynthConfig {
  if (!raw) return defaultSynthConfig();
  try {
    const parsed = JSON.parse(raw) as SynthConfig;
    if (parsed && SYNTH_TYPES.includes(parsed.type)) return parsed;
  } catch {
    // fall through
  }
  return defaultSynthConfig();
}

export function parseSynthPattern(raw: string | null | undefined): SynthNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SynthNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note) =>
        note &&
        typeof note.timeBeats === "number" &&
        typeof note.note === "string" &&
        typeof note.durBeats === "number",
    );
  } catch {
    return [];
  }
}

export function stringifySynthPattern(notes: SynthNote[]): string {
  return JSON.stringify(notes);
}

export const PIANO_NOTES = [
  "C5",
  "B4",
  "A4",
  "G4",
  "F4",
  "E4",
  "D4",
  "C4",
  "B3",
  "A3",
  "G3",
  "F3",
  "E3",
  "D3",
  "C3",
] as const;
