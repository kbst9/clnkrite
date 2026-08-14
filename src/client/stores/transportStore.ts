import { create } from "zustand";
import { beatsToSec } from "@shared/beats";
import { toneEngine } from "../engine/toneEngine";

interface TransportState {
  playing: boolean;
  playheadBeats: number;
  loop: boolean;
  selectedLaneIds: string[];
  setPlayhead: (beats: number, bpm?: number) => void;
  toggleLoop: () => void;
  play: (bpm: number, loopStart: number | null, loopEnd: number | null) => Promise<void>;
  stop: () => void;
  tick: (bpm: number) => void;
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playing: false,
  playheadBeats: 0,
  loop: false,
  selectedLaneIds: [],
  setPlayhead: (beats, bpm = 120) => {
    set({ playheadBeats: Math.max(0, beats) });
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
    set({ playing: false, playheadBeats: 0 });
  },
  tick: (bpm) => {
    if (!get().playing) return;
    set({ playheadBeats: toneEngine.playheadBeats(bpm) });
  },
}));
