import { useEffect } from "react";
import { AddLaneDrawer } from "../components/AddLaneDrawer";
import { BridgeBanner } from "../components/BridgeBanner";
import { ClipMenu } from "../components/ClipMenu";
import { GenerateDrawer } from "../components/GenerateDrawer";
import { JobsPanel } from "../components/JobsPanel";
import { PictureViewer } from "../components/PictureViewer";
import { SynthNoteEditor } from "../components/SynthNoteEditor";
import { Timeline } from "../components/Timeline";
import { TopBar } from "../components/TopBar";
import { toneEngine } from "../engine/toneEngine";
import { loadAssetBytes } from "../lib/cache";
import { computePeaks, loadPeaksForAsset, parsePeaks, putCachedPeaks, uploadPeaks } from "../lib/peaks";
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
  const selectedLaneIds = useTransportStore((s) => s.selectedLaneIds);
  const dragging = useUiStore((s) => s.dragging);
  const snapOn = useUiStore((s) => s.snapOn);
  const snapBeats = useUiStore((s) => s.snapBeats);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);

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
    if (!doc) return;
    for (const asset of doc.assets) {
      if (asset.kind !== "audio") continue;
      void loadPeaksForAsset(asset.id, asset.peaksR2Key);
    }
  }, [doc]);

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
      const asset = useProjectStore.getState().doc?.assets.find((item) => item.id === assetId);
      if (!asset?.peaksR2Key) {
        try {
          const ctx = new AudioContext();
          const audio = await ctx.decodeAudioData(bytes.slice(0));
          const peaks = computePeaks(audio.getChannelData(0), audio.sampleRate);
          const parsed = parsePeaks(peaks);
          if (parsed) putCachedPeaks(assetId, parsed);
          void uploadPeaks(assetId, peaks);
          void ctx.close();
        } catch {
          // peaks are best-effort
        }
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
      if (e.key === "Escape") {
        ui.closeDrawer();
        ui.setContextMenu(null);
        ui.setExplodeClipId(null);
        return;
      }
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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-bg0">
      <BridgeBanner />
      <TopBar />
      {loading && !doc && <p className="p-3 text-[12px] text-fg-faint">LOADING SESSION…</p>}
      {error && <p className="p-3 text-[12px] text-alert">{error}</p>}
      {doc && (
        <>
          <div className="flex h-7 items-center justify-between border-b border-line px-2">
            <button type="button" className="ctrl h-6" onClick={() => openDrawer("add-lane")}>
              + ADD LANE
            </button>
          </div>
          {doc.lanes.length === 0 && (
            <p className="border-b border-line px-2 py-2 text-[12px] text-fg-faint">
              EMPTY SESSION. ADD A MUSIC3 LANE TO GENERATE, OR IMPORT A VOCAL.
            </p>
          )}
          <Timeline />
          <SynthNoteEditor />
          <div className="flex h-5 items-center border-t border-line bg-bg1 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
            ZOOM {zoomPxPerBeat}PX/B · SNAP {snapOn ? (snapBeats === 0.25 ? "1/4" : String(snapBeats)) : "OFF"} · SEL{" "}
            {selectedClipIds.length} CLIPS · ,/. NUDGE · S SPLIT
          </div>
        </>
      )}
      <PictureViewer />
      <ClipMenu />
      <AddLaneDrawer />
      <GenerateDrawer />
      <JobsPanel />
    </div>
  );
}
