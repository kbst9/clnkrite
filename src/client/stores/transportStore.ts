import { create } from "zustand";
import { beatsToSec } from "@shared/beats";
import { toneEngine } from "../engine/toneEngine";

interface TransportState {
  playing: boolean;
  playheadBeats: number;
  seekRevision: number;
  loop: boolean;
  selectedLaneIds: string[];
  toggleLaneSelected: (id: string, additive?: boolean) => void;
  clearLaneSelection: () => void;
  setPlayhead: (beats: number, bpm?: number) => void;
  toggleLoop: () => void;
  play: (bpm: number, loopStart: number | null, loopEnd: number | null) => Promise<void>;
  stop: () => void;
  tick: (bpm: number) => void;
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playing: false,
  playheadBeats: 0,
  seekRevision: 0,
  loop: false,
  selectedLaneIds: [],
  toggleLaneSelected: (id, additive = false) => {
    const current = get().selectedLaneIds;
    if (!additive) {
      set({ selectedLaneIds: current.length === 1 && current[0] === id ? [] : [id] });
      return;
    }
    set({
      selectedLaneIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    });
  },
  clearLaneSelection: () => set({ selectedLaneIds: [] }),
  setPlayhead: (beats, bpm = 120) => {
    set((state) => ({ playheadBeats: Math.max(0, beats), seekRevision: state.seekRevision + 1 }));
    toneEngine.seekSeconds(beatsToSec(Math.max(0, beats), bpm));
  },
  toggleLoop: () => set({ loop: !get().loop }),
  play: async (bpm, loopStart, loopEnd) => {
    toneEngine.setBpm(bpm);
    const loopOn = get().loop && loopStart != null && loopEnd != null && loopEnd > loopStart;
    toneEngine.setLoop(
      Boolean(loopOn),
      loopOn ? beatsToSec(loopStart!, bpm) : 0,
      loopOn ? beatsToSec(loopEnd!, bpm) : 0,
    );
    toneEngine.seekSeconds(beatsToSec(get().playheadBeats, bpm));
    await toneEngine.play();
    set({ playing: true });
  },
  stop: () => {
    toneEngine.stop();
    set((state) => ({ playing: false, playheadBeats: 0, seekRevision: state.seekRevision + 1 }));
  },
  tick: (bpm) => {
    if (!get().playing) return;
    set({ playheadBeats: toneEngine.playheadBeats(bpm) });
  },
}));
