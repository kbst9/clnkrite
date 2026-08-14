import { useRef } from "react";
import { beatsPerBar } from "@shared/beats";
import type { Clip, Lane } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";
import { undoStack } from "../lib/undo";
import { LaneHeader } from "./LaneHeader";

const CLIP_CLASS: Record<Lane["kind"], string> = {
  music3: "clip-music3",
  acestep: "clip-acestep",
  synth: "clip-synth",
  import: "clip-import",
  picture: "clip-picture",
};

type DragKind = "move" | "crop-start" | "crop-end" | "slip" | "fade-in" | "fade-out";

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

function ClipBlock({
  clip,
  lane,
  zoom,
  selected,
  onPointerDown,
}: {
  clip: Clip;
  lane: Lane;
  zoom: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, kind: DragKind) => void;
}) {
  const width = Math.max(8, clip.lengthBeats * zoom);
  const fadeInPx = Math.min(width / 2, clip.fadeInSec * 20);
  const fadeOutPx = Math.min(width / 2, clip.fadeOutSec * 20);
  return (
    <div
      className={`absolute top-2 h-12 overflow-visible rounded-sm ${CLIP_CLASS[lane.kind]} shadow-md ${
        selected ? "ring-2 ring-brass" : "opacity-90"
      }`}
      style={{ left: clip.startBeats * zoom, width }}
      title={clip.label ?? "clip"}
      onPointerDown={(e) => onPointerDown(e, e.altKey ? "slip" : "move")}
      onContextMenu={(e) => {
        e.preventDefault();
        useUiStore.getState().setContextMenu(clip.id, { x: e.clientX, y: e.clientY });
        useUiStore.getState().setSelectedClips([clip.id]);
      }}
    >
      <div className="pointer-events-none px-2 pt-1 font-mono text-[10px] text-ink/80">{clip.label ?? "clip"}</div>
      <div
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-ink/30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "crop-start");
        }}
      />
      <div
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-ink/30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "crop-end");
        }}
      />
      <div
        className="absolute left-0 top-0 z-10 h-2 w-2 cursor-nwse-resize bg-paper/70"
        style={{ width: Math.max(8, fadeInPx) }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "fade-in");
        }}
      />
      <div
        className="absolute right-0 top-0 z-10 h-2 cursor-nesw-resize bg-paper/70"
        style={{ width: Math.max(8, fadeOutPx) }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "fade-out");
        }}
      />
    </div>
  );
}

export function Timeline() {
  const doc = useProjectStore((s) => s.doc);
  const zoom = useUiStore((s) => s.zoomPxPerBeat);
  const setZoom = useUiStore((s) => s.setZoom);
  const snapBeats = useUiStore((s) => s.snapBeats);
  const snapOn = useUiStore((s) => s.snapOn);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const toggleClipSelected = useUiStore((s) => s.toggleClipSelected);
  const setDragging = useUiStore((s) => s.setDragging);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const setPlayhead = useTransportStore((s) => s.setPlayhead);
  const moveClips = useProjectStore((s) => s.moveClips);
  const cropClipEdge = useProjectStore((s) => s.cropClipEdge);
  const slipClipCue = useProjectStore((s) => s.slipClipCue);
  const fadeClip = useProjectStore((s) => s.fadeClip);
  const addSynthPattern = useProjectStore((s) => s.addSynthPattern);
  const drag = useRef<{
    kind: DragKind;
    ids: string[];
    originX: number;
    originBeats: Record<string, number>;
    originCue: Record<string, number>;
    originFade: Record<string, { in: number; out: number }>;
    bypass: boolean;
  } | null>(null);

  if (!doc) return null;
  const session = doc;
  const width = Math.max(session.project.lengthBeats * zoom, 800);

  function beatsFromEvent(e: { clientX: number }, el: HTMLElement): number {
    const scroller = el.closest(".timeline-scroll") as HTMLElement | null;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + (scroller?.scrollLeft ?? 0);
    return x / zoom;
  }

  function onClipPointerDown(clip: Clip, e: React.PointerEvent, kind: DragKind) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.metaKey;
    if (!selectedClipIds.includes(clip.id)) toggleClipSelected(clip.id, additive);
    const ids = selectedClipIds.includes(clip.id) ? selectedClipIds : [clip.id];
    const originBeats: Record<string, number> = {};
    const originCue: Record<string, number> = {};
    const originFade: Record<string, { in: number; out: number }> = {};
    for (const id of ids) {
      const item = session.clips.find((c) => c.id === id);
      if (!item) continue;
      originBeats[id] = item.startBeats;
      originCue[id] = item.cueInSec;
      originFade[id] = { in: item.fadeInSec, out: item.fadeOutSec };
    }
    drag.current = {
      kind,
      ids,
      originX: e.clientX,
      originBeats,
      originCue,
      originFade,
      bypass: e.altKey || !snapOn,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const state = drag.current;
    if (!state) return;
    const deltaPx = e.clientX - state.originX;
    const deltaBeats = deltaPx / zoom;
    const grid = snapOn && !state.bypass ? snapBeats : 0;
    if (state.kind === "move") {
      const first = state.ids[0];
      if (!first) return;
      const origin = state.originBeats[first] ?? 0;
      const current = session.clips.find((c) => c.id === first)?.startBeats ?? origin;
      moveClips(state.ids, origin + deltaBeats - current, grid, state.bypass, false);
    } else if (state.kind === "crop-start" || state.kind === "crop-end") {
      const id = state.ids[0];
      if (!id) return;
      const origin = state.originBeats[id] ?? 0;
      const clip = session.clips.find((c) => c.id === id);
      if (!clip) return;
      const beats = state.kind === "crop-start" ? origin + deltaBeats : origin + clip.lengthBeats + deltaBeats;
      cropClipEdge(id, state.kind === "crop-start" ? "start" : "end", beats, grid, state.bypass, false);
    } else if (state.kind === "slip") {
      const id = state.ids[0];
      if (!id) return;
      slipClipCue(id, (state.originCue[id] ?? 0) + (deltaBeats / (session.project.bpm || 120)) * 60, false);
    } else if (state.kind === "fade-in" || state.kind === "fade-out") {
      const id = state.ids[0];
      if (!id) return;
      const fades = state.originFade[id] ?? { in: 0, out: 0 };
      const deltaSec = (deltaBeats / (session.project.bpm || 120)) * 60;
      fadeClip(
        id,
        state.kind === "fade-in" ? Math.max(0, fades.in + deltaSec) : fades.in,
        state.kind === "fade-out" ? Math.max(0, fades.out - deltaSec) : fades.out,
        false,
      );
    }
  }

  function onPointerUp() {
    const state = drag.current;
    if (state) {
      const store = useProjectStore.getState();
      const before = state.ids.map((id) => {
        const clip = session.clips.find((item) => item.id === id);
        return {
          id,
          startBeats: state.originBeats[id] ?? clip?.startBeats ?? 0,
          cueInSec: state.originCue[id] ?? clip?.cueInSec ?? 0,
          fadeInSec: state.originFade[id]?.in ?? clip?.fadeInSec ?? 0,
          fadeOutSec: state.originFade[id]?.out ?? clip?.fadeOutSec ?? 0,
          lengthBeats: clip?.lengthBeats ?? 0,
        };
      });
      const after = state.ids.map((id) => {
        const clip = store.doc?.clips.find((item) => item.id === id);
        return {
          id,
          startBeats: clip?.startBeats ?? 0,
          cueInSec: clip?.cueInSec ?? 0,
          fadeInSec: clip?.fadeInSec ?? 0,
          fadeOutSec: clip?.fadeOutSec ?? 0,
          lengthBeats: clip?.lengthBeats ?? 0,
        };
      });
      undoStack.push({
        label: state.kind,
        undo: () => {
          for (const clip of before) store.patchClip(clip.id, clip, false);
        },
        redo: () => {
          for (const clip of after) store.patchClip(clip.id, clip, false);
        },
      });
      drag.current = null;
      setDragging(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-72 shrink-0 border-r border-line">
        <div className="flex h-8 items-center justify-between border-b border-line bg-panel px-3 font-mono text-[10px] uppercase tracking-widest text-mute">
          Lanes
          <span>{session.lanes.length}</span>
        </div>
        {session.lanes.length === 0 && (
          <p className="px-3 py-6 font-mono text-xs text-mute">No lanes yet. Add Music3, import, synth, or picture.</p>
        )}
        {session.lanes.map((lane) => (
          <LaneHeader key={lane.id} lane={lane} />
        ))}
      </div>
      <div
        className="timeline-scroll min-w-0 flex-1 overflow-auto"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(zoom + (e.deltaY > 0 ? -4 : 4));
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div style={{ width }} className="relative">
          <Ruler lengthBeats={session.project.lengthBeats} timeSig={session.project.timeSig} zoom={zoom} />
          {session.lanes.map((lane) => (
            <div
              key={lane.id}
              className="relative h-16 border-b border-line bg-ink/40"
              onDoubleClick={(e) => {
                if (lane.kind !== "synth") return;
                const beats = beatsFromEvent(e, e.currentTarget);
                addSynthPattern(lane.id, beats, 16);
              }}
            >
              {session.clips
                .filter((c) => c.laneId === lane.id)
                .map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    lane={lane}
                    zoom={zoom}
                    selected={selectedClipIds.includes(clip.id)}
                    onPointerDown={(ev, kind) => onClipPointerDown(clip, ev, kind)}
                  />
                ))}
            </div>
          ))}
          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-ember"
            style={{ left: playheadBeats * zoom, height: 32 + session.lanes.length * 64 }}
          />
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-crosshair opacity-0"
            aria-label="Seek"
            onClick={(e) => {
              const parent = e.currentTarget.parentElement as HTMLElement;
              setPlayhead(beatsFromEvent(e, parent), session.project.bpm);
              useUiStore.getState().setSelectedClips([]);
              useUiStore.getState().setContextMenu(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
