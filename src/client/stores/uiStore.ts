import { create } from "zustand";
import type { Clip } from "@shared/types";

export type Drawer = "none" | "add-lane" | "generate";

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
  bridgeOnline: boolean | null;
  bridgeError: string | null;
  music3Up: boolean;
  acestepPresent: boolean;
  demucsAvailable: boolean;
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
  setBridge: (online: boolean, error?: string | null) => void;
  setEngines: (music3Up: boolean, acestepPresent: boolean, demucsAvailable?: boolean) => void;
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
  bridgeOnline: null,
  bridgeError: null,
  music3Up: false,
  acestepPresent: false,
  demucsAvailable: false,
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
  setBridge: (online, error = null) => set({ bridgeOnline: online, bridgeError: error }),
  setEngines: (music3Up, acestepPresent, demucsAvailable = false) =>
    set({ music3Up, acestepPresent, demucsAvailable }),
}));
