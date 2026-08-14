import * as Tone from "tone";
import { secToBeats } from "@shared/beats";

/** Tone.js 15 stub: owns Transport BPM and can play/stop. Full clip scheduling is M4. */
class ToneEngine {
  private started = false;

  async ensureStarted(): Promise<void> {
    if (this.started) return;
    await Tone.start();
    this.started = true;
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  setLoop(enabled: boolean, startSec: number, endSec: number): void {
    const t = Tone.getTransport();
    t.loop = enabled;
    if (enabled) {
      t.loopStart = startSec;
      t.loopEnd = endSec;
    }
  }

  async play(): Promise<void> {
    await this.ensureStarted();
    Tone.getTransport().start();
  }

  stop(): void {
    const t = Tone.getTransport();
    t.stop();
    t.position = 0;
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  seconds(): number {
    return Tone.getTransport().seconds;
  }

  playheadBeats(bpm: number): number {
    return secToBeats(this.seconds(), bpm);
  }

  seekSeconds(sec: number): void {
    Tone.getTransport().seconds = Math.max(0, sec);
  }
}

export const toneEngine = new ToneEngine();
