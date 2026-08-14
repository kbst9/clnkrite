import { useEffect } from "react";
import type { EnginesResponse } from "@shared/types";
import { AddLaneDrawer } from "../components/AddLaneDrawer";
import { GenerateDrawer } from "../components/GenerateDrawer";
import { Timeline } from "../components/Timeline";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
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
        setEngines(Boolean(engines.health?.music3.up), Boolean(engines.health?.acestep?.up));
      } catch {
        setBridge(false, "bridge_offline");
        setEngines(false, false);
      }
    })();
  }, [setBridge, setEngines]);

  return (
    <div className="relative flex h-full flex-col">
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
              zoom {zoomPxPerBeat}px/beat · ctrl+wheel
            </span>
          </div>
          <Timeline />
        </>
      )}
      <AddLaneDrawer />
      <GenerateDrawer />
    </div>
  );
}
