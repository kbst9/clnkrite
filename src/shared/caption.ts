export interface CaptionDraftInput {
  bpm: number;
  keySig: string;
  timeSig: string;
  vibe: string;
}

/** Pure string template. No LLM. Mirrors the generate-drawer "Draft from project" button. */
export function draftCaptionFromProject(input: CaptionDraftInput): string {
  const vibe = input.vibe.trim() || "(describe genre, mood, emotional arc)";
  return [
    "Global Metadata",
    `Genre / vibe: ${vibe}`,
    `BPM: ${input.bpm}`,
    `Key: ${input.keySig}`,
    `Time signature: ${input.timeSig}`,
    "Emotional arc:",
    "Production profile:",
    "",
    "Vocal Details",
    "Gender:",
    "Timbre:",
    "Performance:",
    "Harmonies:",
    "FX:",
    "",
    "Arrangement",
    "Instruments:",
    "Groove:",
    "Bass:",
    "Percussion:",
    "Textures:",
    "Spatial FX:",
  ].join("\n");
}

export function firstSectionTag(lyrics: string): string | null {
  const match = lyrics.match(/\[(Intro|Verse|Pre-Chorus|Chorus|Post-Chorus|Bridge|Instrumental|Solo|Outro)\]/i);
  return match ? `[${match[1]}]` : null;
}

export function captionPrefix(caption: string, max = 32): string {
  const line = caption
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !s.endsWith(":") && !s.startsWith("Global") && !s.startsWith("Vocal") && !s.startsWith("Arrangement"));
  if (!line) return "generate";
  return line.length > max ? `${line.slice(0, max).trim()}…` : line;
}
