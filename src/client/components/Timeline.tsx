import { beatsPerBar } from "@shared/beats";
import type { Clip, Lane } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";
import { LaneHeader } from "./LaneHeader";

const CLIP_CLASS: Record<Lane["kind"], string> = {
  music3: "clip-music3",
  acestep: "clip-acestep",
  synth: "clip-synth",
  import: "clip-import",
  picture: "clip-picture",
};

function Ruler({ lengthBeats, timeSig, zoom }: { lengthBeats: number; timeSig: string; zoom: number }) {
  const perBar = beatsPerBar(timeSig);
  const bars = Math.ceil(lengthBeats / perBar);
  return (
    <div className="relative h-8 border-b border-line bg-panel font-mono text-[10px] text-mute">
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full border-l border-line/80 pl-1"
          style={{ left: i * perBar * zoom }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function ClipBlock({ clip, lane, zoom }: { clip: Clip; lane: Lane; zoom: number }) {
  return (
    <div
      className={`absolute top-2 h-12 overflow-hidden rounded-sm ${CLIP_CLASS[lane.kind]} opacity-90 shadow-md`}
      style={{ left: clip.startBeats * zoom, width: Math.max(8, clip.lengthBeats * zoom) }}
      title={clip.label ?? "clip"}
    >
      <div className="px-2 pt-1 font-mono text-[10px] text-ink/80">{clip.label ?? "clip"}</div>
    </div>
  );
}

export function Timeline() {
  const doc = useProjectStore((s) => s.doc);
  const zoom = useUiStore((s) => s.zoomPxPerBeat);
  const setZoom = useUiStore((s) => s.setZoom);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const setPlayhead = useTransportStore((s) => s.setPlayhead);

  if (!doc) return null;
  const width = Math.max(doc.project.lengthBeats * zoom, 800);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-72 shrink-0 border-r border-line">
        <div className="flex h-8 items-center justify-between border-b border-line bg-panel px-3 font-mono text-[10px] uppercase tracking-widest text-mute">
          Lanes
          <span>{doc.lanes.length}</span>
        </div>
        {doc.lanes.map((lane) => (
          <LaneHeader key={lane.id} lane={lane} />
        ))}
      </div>
      <div
        className="min-w-0 flex-1 overflow-auto"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(zoom + (e.deltaY > 0 ? -4 : 4));
          }
        }}
      >
        <div style={{ width }} className="relative">
          <Ruler lengthBeats={doc.project.lengthBeats} timeSig={doc.project.timeSig} zoom={zoom} />
          {doc.lanes.map((lane) => (
            <div key={lane.id} className="relative h-16 border-b border-line bg-ink/40">
              {doc.clips
                .filter((c) => c.laneId === lane.id)
                .map((clip) => (
                  <ClipBlock key={clip.id} clip={clip} lane={lane} zoom={zoom} />
                ))}
            </div>
          ))}
          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-ember"
            style={{ left: playheadBeats * zoom, height: 32 + doc.lanes.length * 64 }}
          />
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-crosshair opacity-0"
            aria-label="Seek"
            onClick={(e) => {
              const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              const x = e.clientX - rect.left + (e.currentTarget.parentElement?.parentElement?.scrollLeft ?? 0);
              setPlayhead(x / zoom);
            }}
          />
        </div>
      </div>
    </div>
  );
}
