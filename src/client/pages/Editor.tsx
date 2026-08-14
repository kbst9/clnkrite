import { useEffect } from "react";
import type { EnginesResponse } from "@shared/types";
import { AddLaneDrawer } from "../components/AddLaneDrawer";
import { BridgeBanner } from "../components/BridgeBanner";
import { ClipMenu } from "../components/ClipMenu";
import { GenerateDrawer } from "../components/GenerateDrawer";
import { PictureViewer } from "../components/PictureViewer";
import { SynthNoteEditor } from "../components/SynthNoteEditor";
import { Timeline } from "../components/Timeline";
import { TopBar } from "../components/TopBar";
import { toneEngine } from "../engine/toneEngine";
import { api } from "../lib/api";
import { loadAssetBytes } from "../lib/cache";
import { computePeaks, uploadPeaks } from "../lib/peaks";
import { undoStack } from "../lib/undo";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

export function Editor({ projectId }: { projectId: string }) {
  const loadProject = useProjectStore((s) => s.loadProject);
  const doc = useProjectStore((s) => s.doc);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const hydrate = useJobStore((s) => s.hydrate);
  const tick = useTransportStore((s) => s.tick);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const zoomPxPerBeat = useUiStore((s) => s.zoomPxPerBeat);
  const setBridge = useUiStore((s) => s.setBridge);
  const setEngines = useUiStore((s) => s.setEngines);
  const selectedLaneIds = useTransportStore((s) => s.selectedLaneIds);
  const dragging = useUiStore((s) => s.dragging);
  const snapOn = useUiStore((s) => s.snapOn);
  const snapBeats = useUiStore((s) => s.snapBeats);

  useEffect(() => {
    void loadProject(projectId);
  }, [loadProject, projectId]);

  useEffect(() => {
    if (doc?.jobs) hydrate(doc.jobs);
  }, [doc?.jobs, hydrate]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const bpm = useProjectStore.getState().doc?.project.bpm ?? 120;
      tick(bpm);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  useEffect(() => {
    void (async () => {
      try {
        const engines = await api<EnginesResponse>("/api/engines");
        setBridge(true);
        setEngines(
          Boolean(engines.health?.music3.up),
          Boolean(engines.health?.acestep?.up),
          Boolean(engines.health?.demucs.available),
        );
      } catch {
        setBridge(false, "bridge_offline");
        setEngines(false, false, false);
      }
    })();
  }, [setBridge, setEngines]);

  useEffect(() => {
    if (!doc) return;
    toneEngine.applyMixer(doc.lanes, selectedLaneIds);
    toneEngine.setBpm(doc.project.bpm);
    const loopOn =
      useTransportStore.getState().loop &&
      doc.project.loopStartBeats != null &&
      doc.project.loopEndBeats != null &&
      doc.project.loopEndBeats > doc.project.loopStartBeats;
    toneEngine.setLoop(
      Boolean(loopOn),
      loopOn ? (doc.project.loopStartBeats! / doc.project.bpm) * 60 : 0,
      loopOn ? (doc.project.loopEndBeats! / doc.project.bpm) * 60 : 0,
    );
    if (dragging) return;
    void toneEngine.rebuildSchedule(doc, async (assetId) => {
      const bytes = await loadAssetBytes(assetId);
      try {
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(bytes.slice(0));
        const peaks = computePeaks(audio.getChannelData(0), audio.sampleRate);
        void uploadPeaks(assetId, peaks);
        void ctx.close();
      } catch {
        // peaks are best-effort
      }
      return bytes;
    });
  }, [doc, selectedLaneIds, dragging]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const ui = useUiStore.getState();
      const project = useProjectStore.getState();
      const transport = useTransportStore.getState();
      const ids = ui.selectedClipIds;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) undoStack.redo();
        else undoStack.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        ui.setClipboard(project.copyClips(ids));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        project.pasteClips(ui.clipboard, transport.playheadBeats);
        return;
      }
      if (e.key === "," || e.key === "<") {
        project.nudgeSelected(ids, -1, ui.snapOn ? ui.snapBeats : 0.25);
      }
      if (e.key === "." || e.key === ">") {
        project.nudgeSelected(ids, 1, ui.snapOn ? ui.snapBeats : 0.25);
      }
      if (e.key === "s" || e.key === "S") {
        const playhead = transport.playheadBeats;
        const targets = ids.length
          ? ids
          : (project.doc?.clips.filter((c) => c.startBeats < playhead && c.startBeats + c.lengthBeats > playhead).map((c) => c.id) ?? []);
        project.splitAt(targets, playhead);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        project.removeClips(ids);
        ui.setSelectedClips([]);
      }
      if (e.key === "Escape") ui.setContextMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <BridgeBanner />
      <TopBar />
      {loading && !doc && <p className="p-6 font-mono text-sm text-mute">Loading session…</p>}
      {error && <p className="p-6 font-mono text-sm text-ember">{error}</p>}
      {doc && (
        <>
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <button
              type="button"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass hover:underline"
              onClick={() => openDrawer("add-lane")}
            >
              + Add lane
            </button>
            <span className="font-mono text-[10px] text-mute">
              zoom {zoomPxPerBeat}px/beat · ctrl+wheel · snap {snapOn ? snapBeats : "off"} · ,/. nudge · S split
            </span>
          </div>
          {doc.lanes.length === 0 && (
            <p className="border-b border-line px-4 py-3 font-mono text-xs text-mute">
              Empty session. Add a Music3 lane to generate, or import a vocal to nudge into sync.
            </p>
          )}
          <Timeline />
          <SynthNoteEditor />
        </>
      )}
      <PictureViewer />
      <ClipMenu />
      <AddLaneDrawer />
      <GenerateDrawer />
    </div>
  );
}
