import { create } from "zustand";
import type { BridgeHealth, Clip, EnginesResponse } from "@shared/types";
import { api } from "../lib/api";

export type Drawer = "none" | "add-lane" | "generate" | "jobs";

interface UiState {
  drawer: Drawer;
  zoomPxPerBeat: number;
  snapBeats: number;
  snapOn: boolean;
  selectedClipIds: string[];
  clipboard: Clip[];
  dragging: boolean;
  pictureOpen: boolean;
  contextClipId: string | null;
  contextXY: { x: number; y: number } | null;
  explodeClipId: string | null;
  jobParamsId: string | null;
  bridgeOnline: boolean | null;
  bridgeError: string | null;
  music3Up: boolean;
  music3Model: string | null;
  acestepPresent: boolean;
  demucsAvailable: boolean;
  queueDepth: number;
  queueRunning: boolean;
  openDrawer: (drawer: Drawer) => void;
  closeDrawer: () => void;
  setZoom: (px: number) => void;
  toggleSnap: () => void;
  setSelectedClips: (ids: string[]) => void;
  toggleClipSelected: (id: string, additive?: boolean) => void;
  setClipboard: (clips: Clip[]) => void;
  setDragging: (dragging: boolean) => void;
  setPictureOpen: (open: boolean) => void;
  setContextMenu: (clipId: string | null, xy?: { x: number; y: number } | null) => void;
  setExplodeClipId: (id: string | null) => void;
  setJobParamsId: (id: string | null) => void;
  setBridge: (online: boolean, error?: string | null) => void;
  applyEngines: (engines: EnginesResponse) => void;
  setEngines: (music3Up: boolean, acestepPresent: boolean, demucsAvailable?: boolean) => void;
  pollEngines: () => Promise<void>;
}

export function applyHealth(health: BridgeHealth | null): Pick<
  UiState,
  "music3Up" | "music3Model" | "acestepPresent" | "demucsAvailable" | "queueDepth" | "queueRunning"
> {
  return {
    music3Up: Boolean(health?.music3.up),
    music3Model: health?.music3.model ?? null,
    acestepPresent: Boolean(health?.acestep?.up),
    demucsAvailable: Boolean(health?.demucs.available),
    queueDepth: health?.queue.depth ?? 0,
    queueRunning: Boolean(health?.queue.running),
  };
}

export const useUiStore = create<UiState>((set, get) => ({
  drawer: "none",
  zoomPxPerBeat: 28,
  snapBeats: 0.25,
  snapOn: true,
  selectedClipIds: [],
  clipboard: [],
  dragging: false,
  pictureOpen: true,
  contextClipId: null,
  contextXY: null,
  explodeClipId: null,
  jobParamsId: null,
  bridgeOnline: null,
  bridgeError: null,
  music3Up: false,
  music3Model: null,
  acestepPresent: false,
  demucsAvailable: false,
  queueDepth: 0,
  queueRunning: false,
  openDrawer: (drawer) => set({ drawer }),
  closeDrawer: () => set({ drawer: "none" }),
  setZoom: (px) => set({ zoomPxPerBeat: Math.min(96, Math.max(8, px)) }),
  toggleSnap: () => set({ snapOn: !get().snapOn }),
  setSelectedClips: (ids) => set({ selectedClipIds: ids }),
  toggleClipSelected: (id, additive = false) => {
    const current = get().selectedClipIds;
    if (!additive) {
      set({ selectedClipIds: [id] });
      return;
    }
    set({
      selectedClipIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    });
  },
  setClipboard: (clips) => set({ clipboard: clips }),
  setDragging: (dragging) => set({ dragging }),
  setPictureOpen: (open) => set({ pictureOpen: open }),
  setContextMenu: (clipId, xy = null) => set({ contextClipId: clipId, contextXY: xy }),
  setExplodeClipId: (id) => set({ explodeClipId: id }),
  setJobParamsId: (id) => set({ jobParamsId: id }),
  setBridge: (online, error = null) => set({ bridgeOnline: online, bridgeError: error }),
  applyEngines: (engines) =>
    set({
      bridgeOnline: engines.online,
      bridgeError: engines.online ? null : (engines.error ?? "bridge_offline"),
      ...applyHealth(engines.health),
    }),
  setEngines: (music3Up, acestepPresent, demucsAvailable = false) =>
    set({ music3Up, acestepPresent, demucsAvailable }),
  pollEngines: async () => {
    try {
      const engines = await api<EnginesResponse>("/api/engines");
      get().applyEngines(engines);
    } catch {
      set({
        bridgeOnline: false,
        bridgeError: "bridge_offline",
        music3Up: false,
        music3Model: null,
        acestepPresent: false,
        demucsAvailable: false,
        queueDepth: 0,
        queueRunning: false,
      });
    }
  },
}));
