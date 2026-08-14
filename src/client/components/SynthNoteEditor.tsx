import { PIANO_NOTES, parseSynthPattern, stringifySynthPattern } from "@shared/synth";
import type { SynthNote } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

export function SynthNoteEditor() {
  const selected = useUiStore((s) => s.selectedClipIds[0]);
  const doc = useProjectStore((s) => s.doc);
  const patchClip = useProjectStore((s) => s.patchClip);
  const clip = doc?.clips.find((item) => item.id === selected);
  const lane = clip ? doc?.lanes.find((item) => item.id === clip.laneId) : null;
  if (!clip || !lane || lane.kind !== "synth") return null;
  const notes = parseSynthPattern(clip.synthPattern);
  const zoom = 24;

  function toggleNote(note: string, timeBeats: number) {
    const existing = notes.find((item) => item.note === note && Math.abs(item.timeBeats - timeBeats) < 0.01);
    let next: SynthNote[];
    if (existing) next = notes.filter((item) => item !== existing);
    else next = [...notes, { timeBeats, note, durBeats: 0.25, vel: 0.85 }];
    patchClip(clip!.id, { synthPattern: stringifySynthPattern(next) });
  }

  const steps = Math.max(16, Math.ceil(clip.lengthBeats * 4));

  return (
    <div className="border-t border-line bg-panel px-4 py-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">
        Mini note editor · {lane.name} · click to place
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block">
          {PIANO_NOTES.map((note) => (
            <div key={note} className="flex h-4">
              <span className="w-8 font-mono text-[9px] text-mute">{note}</span>
              {Array.from({ length: steps }, (_, i) => {
                const timeBeats = i * 0.25;
                const on = notes.some((item) => item.note === note && Math.abs(item.timeBeats - timeBeats) < 0.01);
                return (
                  <button
                    key={i}
                    type="button"
                    className={`h-4 border border-line/60 ${on ? "bg-lane-synth" : "bg-ink"}`}
                    style={{ width: zoom }}
                    onClick={() => toggleNote(note, timeBeats)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
