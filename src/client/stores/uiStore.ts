import { create } from "zustand";

export type Drawer = "none" | "add-lane" | "generate";

interface UiState {
  drawer: Drawer;
  zoomPxPerBeat: number;
  snapBeats: number;
  bridgeOnline: boolean | null;
  bridgeError: string | null;
  music3Up: boolean;
  acestepPresent: boolean;
  openDrawer: (drawer: Drawer) => void;
  closeDrawer: () => void;
  setZoom: (px: number) => void;
  setBridge: (online: boolean, error?: string | null) => void;
  setEngines: (music3Up: boolean, acestepPresent: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawer: "none",
  zoomPxPerBeat: 28,
  snapBeats: 0.25,
  bridgeOnline: null,
  bridgeError: null,
  music3Up: false,
  acestepPresent: false,
  openDrawer: (drawer) => set({ drawer }),
  closeDrawer: () => set({ drawer: "none" }),
  setZoom: (px) => set({ zoomPxPerBeat: Math.min(96, Math.max(8, px)) }),
  setBridge: (online, error = null) => set({ bridgeOnline: online, bridgeError: error }),
  setEngines: (music3Up, acestepPresent) => set({ music3Up, acestepPresent }),
}));
