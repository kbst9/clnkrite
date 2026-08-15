import { useEffect, useRef, useState } from "react";
import { beatsPerBar, beatsToSec, formatPlayhead } from "@shared/beats";
import { parseSynthPattern } from "@shared/synth";
import type { Clip, Lane } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";
import { undoStack } from "../lib/undo";
import { drawPeaks, getCachedPeaks, subscribePeaks } from "../lib/peaks";
import { LaneHeader } from "./LaneHeader";

const LANE_COLOR: Record<Lane["kind"], string> = {
  music3: "var(--color-lane-music3)",
  acestep: "var(--color-lane-acestep)",
  synth: "var(--color-lane-synth)",
  import: "var(--color-lane-import)",
  picture: "var(--color-lane-picture)",
};

const LANE_H = 48;
const RULER_H = 24;
const BRACE_H = 12;

type DragKind = "move" | "crop-start" | "crop-end" | "slip" | "fade-in" | "fade-out";

function LoopBrace({
  lengthBeats,
  zoom,
  start,
  end,
}: {
  lengthBeats: number;
  zoom: number;
  start: number | null;
  end: number | null;
}) {
  const patchProject = useProjectStore((s) => s.patchProject);
  const drag = useRef<{ edge: "start" | "end" | "body"; originX: number; originStart: number; originEnd: number } | null>(
    null,
  );
  const lo = start ?? 0;
  const hi = end ?? lengthBeats;
  const left = lo * zoom;
  const width = Math.max(8, (hi - lo) * zoom);

  function beatsFromDelta(dx: number): number {
    return dx / zoom;
  }

  function onMove(e: React.PointerEvent) {
    const state = drag.current;
    if (!state) return;
    const delta = beatsFromDelta(e.clientX - state.originX);
    if (state.edge === "start") {
      patchProject({ loopStartBeats: Math.max(0, Math.min(state.originStart + delta, hi - 0.25)) });
    } else if (state.edge === "end") {
      patchProject({ loopEndBeats: Math.max(lo + 0.25, state.originEnd + delta) });
    } else {
      const span = state.originEnd - state.originStart;
      const nextStart = Math.max(0, state.originStart + delta);
      patchProject({ loopStartBeats: nextStart, loopEndBeats: nextStart + span });
    }
  }

  return (
    <div className="relative h-3 bg-bg1">
      <div
        className="absolute top-0 h-full text-[10px] leading-3 text-fg-dim"
        style={{ left, width }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { edge: "body", originX: e.clientX, originStart: lo, originEnd: hi };
        }}
        onPointerMove={onMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => patchProject({ loopStartBeats: 0, loopEndBeats: lengthBeats })}
      >
        <span
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-fg-dim"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { edge: "start", originX: e.clientX, originStart: lo, originEnd: hi };
          }}
          onPointerMove={onMove}
          onPointerUp={() => {
            drag.current = null;
          }}
        />
        <span className="pointer-events-none block overflow-hidden px-2">[══════]</span>
        <span
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-fg-dim"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { edge: "end", originX: e.clientX, originStart: lo, originEnd: hi };
          }}
          onPointerMove={onMove}
          onPointerUp={() => {
            drag.current = null;
          }}
        />
      </div>
    </div>
  );
}

function Ruler({ lengthBeats, timeSig, zoom }: { lengthBeats: number; timeSig: string; zoom: number }) {
  const perBar = beatsPerBar(timeSig);
  const bars = Math.ceil(lengthBeats / perBar);
  const beats = Math.ceil(lengthBeats);
  return (
    <div className="relative h-6 border-b border-line bg-bg1 text-[10px] leading-[14px] text-fg-faint">
      {Array.from({ length: beats }, (_, i) => (
        <div
          key={`b-${i}`}
          className="absolute bottom-0"
          style={{
            left: i * zoom,
            height: i % perBar === 0 ? 24 : 4,
            borderLeft: `1px solid ${i % perBar === 0 ? "var(--color-line-strong)" : "var(--color-line)"}`,
          }}
        />
      ))}
      {zoom >= 48 &&
        Array.from({ length: beats * 4 }, (_, i) =>
          i % 4 === 0 ? null : (
            <div
              key={`s-${i}`}
              className="absolute bottom-0 h-1 border-l border-line"
              style={{ left: (i * zoom) / 4 }}
            />
          ),
        )}
      {Array.from({ length: bars }, (_, i) => (
        <div key={`n-${i}`} className="absolute top-0 pl-1" style={{ left: i * perBar * zoom }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function Waveform({
  assetId,
  width,
  height,
  cueInSec,
  lengthSec,
}: {
  assetId: string;
  width: number;
  height: number;
  cueInSec: number;
  lengthSec: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setRev] = useState(0);

  useEffect(() => subscribePeaks(() => setRev((n) => n + 1)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const peaks = getCachedPeaks(assetId);
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = height;
    drawPeaks(ctx, peaks, canvas.width, canvas.height, cueInSec, lengthSec, "#8a949d");
  });

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 bottom-0 h-7 w-full" />;
}

function SynthDots({ clip, width }: { clip: Clip; width: number }) {
  const notes = parseSynthPattern(clip.synthPattern);
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note, i) => {
        const x = (note.timeBeats / Math.max(0.001, clip.lengthBeats)) * width;
        const pc = note.note.match(/\d+/)?.[0];
        const octave = Number(pc ?? 4);
        const y = 28 - (octave - 2) * 6;
        return (
          <span
            key={`${note.note}-${note.timeBeats}-${i}`}
            className="pointer-events-none absolute h-0.5 w-0.5 bg-lane-synth"
            style={{ left: x, top: Math.max(4, y) }}
          />
        );
      })}
    </>
  );
}

function ClipBlock({
  clip,
  lane,
  zoom,
  selected,
  bpm,
  overlap,
  onPointerDown,
}: {
  clip: Clip;
  lane: Lane;
  zoom: number;
  selected: boolean;
  bpm: number;
  overlap: boolean;
  onPointerDown: (e: React.PointerEvent, kind: DragKind) => void;
}) {
  const width = Math.max(8, clip.lengthBeats * zoom);
  const color = LANE_COLOR[lane.kind];
  const fadeInPx = Math.min(width / 2, clip.fadeInSec * 20);
  const fadeOutPx = Math.min(width / 2, clip.fadeOutSec * 20);
  const lengthSec = beatsToSec(clip.lengthBeats, bpm);

  return (
    <div
      className={`absolute top-1 z-[1] h-10 overflow-visible ${overlap ? "clip-overlap" : "clip-body"}`}
      style={{ left: clip.startBeats * zoom, width, borderColor: selected ? "var(--color-accent)" : color }}
      title={clip.label ?? "clip"}
      onPointerDown={(e) => onPointerDown(e, e.altKey ? "slip" : "move")}
      onContextMenu={(e) => {
        e.preventDefault();
        useUiStore.getState().setContextMenu(clip.id, { x: e.clientX, y: e.clientY });
        useUiStore.getState().setSelectedClips([clip.id]);
      }}
    >
      <div className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />
      <div className="pointer-events-none px-2 pt-0.5 text-[10px] uppercase leading-[14px] text-fg-dim">
        {clip.label ?? "CLIP"}
      </div>
      {clip.assetId && lane.kind !== "picture" && (
        <Waveform assetId={clip.assetId} width={width} height={28} cueInSec={clip.cueInSec} lengthSec={lengthSec} />
      )}
      {lane.kind === "synth" && <SynthDots clip={clip} width={width} />}
      {lane.kind === "picture" && (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 flex gap-px">
          {Array.from({ length: Math.max(1, Math.floor(width / 16)) }, (_, i) => (
            <span key={i} className="h-3 flex-1 bg-bg3" />
          ))}
        </div>
      )}
      {clip.fadeInSec > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={width} height={40}>
          <line x1="0" y1="40" x2={fadeInPx} y2="0" stroke="var(--color-fg-dim)" strokeWidth="1" />
        </svg>
      )}
      {clip.fadeOutSec > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={width} height={40}>
          <line x1={width - fadeOutPx} y1="0" x2={width} y2="40" stroke="var(--color-fg-dim)" strokeWidth="1" />
        </svg>
      )}
      {selected && (
        <>
          <span className="reticle left-0 top-0 border-l border-t" />
          <span className="reticle right-0 top-0 border-r border-t" />
          <span className="reticle bottom-0 left-0 border-b border-l" />
          <span className="reticle bottom-0 right-0 border-b border-r" />
        </>
      )}
      <div
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-fg/20"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "crop-start");
        }}
      />
      <div
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-fg/20"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "crop-end");
        }}
      />
      <div
        className="absolute left-0 top-0 z-10 h-1.5 cursor-nwse-resize bg-fg-dim/70"
        style={{ width: Math.max(8, fadeInPx) }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "fade-in");
        }}
      />
      <div
        className="absolute right-0 top-0 z-10 h-1.5 cursor-nesw-resize bg-fg-dim/70"
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
  const [hoverBeats, setHoverBeats] = useState<number | null>(null);
  const drag = useRef<{
    kind: DragKind;
    ids: string[];
    originX: number;
    originBeats: Record<string, number>;
    originCue: Record<string, number>;
    originLength: Record<string, number>;
    originFade: Record<string, { in: number; out: number }>;
    bypass: boolean;
  } | null>(null);

  if (!doc) return null;
  const session = doc;
  const width = Math.max(session.project.lengthBeats * zoom, 800);
  const perBar = beatsPerBar(session.project.timeSig);
  const bars = Math.ceil(session.project.lengthBeats / perBar);

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
    const originLength: Record<string, number> = {};
    const originFade: Record<string, { in: number; out: number }> = {};
    for (const id of ids) {
      const item = session.clips.find((c) => c.id === id);
      if (!item) continue;
      originBeats[id] = item.startBeats;
      originCue[id] = item.cueInSec;
      originLength[id] = item.lengthBeats;
      originFade[id] = { in: item.fadeInSec, out: item.fadeOutSec };
    }
    drag.current = {
      kind,
      ids,
      originX: e.clientX,
      originBeats,
      originCue,
      originLength,
      originFade,
      bypass: e.altKey || !snapOn,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const parent = e.currentTarget as HTMLElement;
    setHoverBeats(beatsFromEvent(e, parent.querySelector(".timeline-board") as HTMLElement ?? parent));
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
      const beats =
        state.kind === "crop-start"
          ? origin + deltaBeats
          : origin + (state.originLength[id] ?? 0) + deltaBeats;
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
          lengthBeats: state.originLength[id] ?? clip?.lengthBeats ?? 0,
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
      <div className="w-[280px] shrink-0 border-r border-line bg-bg1">
        <div className="flex h-9 items-end justify-between border-b border-line px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          LANES
          <span>{session.lanes.length}</span>
        </div>
        {session.lanes.length === 0 && (
          <p className="px-2 py-4 text-[12px] text-fg-faint">NO LANES. ADD MUSIC3, IMPORT, SYNTH, OR PICTURE.</p>
        )}
        {session.lanes.map((lane) => (
          <LaneHeader key={lane.id} lane={lane} />
        ))}
      </div>
      <div
        className="timeline-scroll min-w-0 flex-1 overflow-auto bg-bg0"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(zoom + (e.deltaY > 0 ? -4 : 4));
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHoverBeats(null)}
      >
        <div style={{ width }} className="timeline-board relative">
          <LoopBrace
            lengthBeats={session.project.lengthBeats}
            zoom={zoom}
            start={session.project.loopStartBeats}
            end={session.project.loopEndBeats}
          />
          <Ruler lengthBeats={session.project.lengthBeats} timeSig={session.project.timeSig} zoom={zoom} />
          {session.lanes.map((lane, index) => {
            const laneClips = session.clips.filter((c) => c.laneId === lane.id);
            return (
              <div
                key={lane.id}
                className={`relative border-b border-line ${index % 2 === 0 ? "bg-bg0" : "bg-stripe"}`}
                style={{ height: LANE_H }}
                onDoubleClick={(e) => {
                  if (lane.kind !== "synth") return;
                  const beats = beatsFromEvent(e, e.currentTarget);
                  addSynthPattern(lane.id, beats, 16);
                }}
              >
                {Array.from({ length: bars }, (_, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute inset-y-0 border-l border-line/20"
                    style={{ left: i * perBar * zoom }}
                  />
                ))}
                {laneClips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    lane={lane}
                    zoom={zoom}
                    selected={selectedClipIds.includes(clip.id)}
                    bpm={session.project.bpm}
                    overlap={laneClips.some(
                      (other) =>
                        other.id !== clip.id &&
                        other.startBeats < clip.startBeats + clip.lengthBeats &&
                        other.startBeats + other.lengthBeats > clip.startBeats,
                    )}
                    onPointerDown={(ev, kind) => onClipPointerDown(clip, ev, kind)}
                  />
                ))}
              </div>
            );
          })}
          <div
            className="pointer-events-none absolute z-10 w-px bg-alert"
            style={{
              left: playheadBeats * zoom,
              top: 0,
              height: BRACE_H + RULER_H + session.lanes.length * LANE_H,
            }}
          />
          <div
            className="pointer-events-none absolute z-20 h-0 w-0 border-l-[3.5px] border-r-[3.5px] border-t-[7px] border-l-transparent border-r-transparent border-t-alert"
            style={{ left: playheadBeats * zoom - 3.5, top: BRACE_H }}
          />
          {hoverBeats != null && (
            <>
              <div
                className="pointer-events-none absolute top-0 z-10 w-px bg-fg-faint"
                style={{ left: hoverBeats * zoom, height: BRACE_H + RULER_H + session.lanes.length * LANE_H }}
              />
              <span
                className="pointer-events-none absolute z-20 bg-bg1 px-1 text-[10px] text-fg-dim"
                style={{ left: hoverBeats * zoom + 4, top: BRACE_H }}
              >
                {formatPlayhead(hoverBeats, session.project.timeSig)}
              </span>
            </>
          )}
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
