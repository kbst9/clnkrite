import * as Tone from "tone";
import { beatsToSec, secToBeats } from "@shared/beats";
import { isLaneAudible } from "@shared/mixer";
import { parseSynthConfig, parseSynthPattern } from "@shared/synth";
import type { Clip, Lane, ProjectDocument, SynthType } from "@shared/types";

type BufferFn = (assetId: string) => Promise<ArrayBuffer>;

function makeInstrument(type: SynthType): Tone.PolySynth | Tone.MonoSynth | Tone.FMSynth | Tone.MembraneSynth {
  switch (type) {
    case "MonoSynth":
      return new Tone.MonoSynth();
    case "FMSynth":
      return new Tone.FMSynth();
    case "MembraneSynth":
      return new Tone.MembraneSynth();
    default:
      return new Tone.PolySynth(Tone.Synth);
  }
}

class ToneEngine {
  private started = false;
  private channels = new Map<string, Tone.Channel>();
  private players = new Map<string, Tone.Player>();
  private parts = new Map<string, Tone.Part>();
  private instruments = new Map<string, Tone.PolySynth | Tone.MonoSynth | Tone.FMSynth | Tone.MembraneSynth>();
  private scheduleKey = "";

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

  applyMixer(lanes: Lane[], selectedLaneIds: string[]): void {
    for (const lane of lanes) {
      let channel = this.channels.get(lane.id);
      if (!channel) {
        channel = new Tone.Channel({ volume: lane.volumeDb, pan: lane.pan }).toDestination();
        this.channels.set(lane.id, channel);
      }
      channel.volume.value = lane.volumeDb;
      channel.pan.value = lane.pan;
      channel.mute = !isLaneAudible(lane, lanes, selectedLaneIds);
      channel.solo = false;
    }
    for (const [id, channel] of this.channels) {
      if (!lanes.some((lane) => lane.id === id)) {
        channel.dispose();
        this.channels.delete(id);
      }
    }
  }

  private channelFor(lane: Lane): Tone.Channel {
    let channel = this.channels.get(lane.id);
    if (!channel) {
      channel = new Tone.Channel({ volume: lane.volumeDb, pan: lane.pan }).toDestination();
      this.channels.set(lane.id, channel);
    }
    return channel;
  }

  private clearSchedule(): void {
    for (const player of this.players.values()) {
      try {
        player.unsync();
      } catch {
        // already unsynced
      }
      player.dispose();
    }
    this.players.clear();
    for (const part of this.parts.values()) {
      part.dispose();
    }
    this.parts.clear();
    for (const inst of this.instruments.values()) inst.dispose();
    this.instruments.clear();
  }

  async rebuildSchedule(doc: ProjectDocument, getBuffer: BufferFn): Promise<void> {
    const key = [
      doc.project.bpm,
      doc.project.loopStartBeats,
      doc.project.loopEndBeats,
      ...doc.clips.map(
        (c) =>
          `${c.id}:${c.laneId}:${c.startBeats}:${c.lengthBeats}:${c.cueInSec}:${c.fadeInSec}:${c.fadeOutSec}:${c.assetId}:${c.synthPattern}:${c.gainDb}`,
      ),
    ].join("|");
    if (key === this.scheduleKey && this.players.size + this.parts.size > 0) return;
    this.scheduleKey = key;
    this.clearSchedule();
    this.setBpm(doc.project.bpm);
    const lanes = new Map(doc.lanes.map((lane) => [lane.id, lane]));
    for (const clip of doc.clips) {
      const lane = lanes.get(clip.laneId);
      if (!lane || lane.kind === "picture") continue;
      if (clip.synthPattern) this.scheduleSynth(clip, lane, doc.project.bpm);
      else if (clip.assetId) await this.schedulePlayer(clip, lane, doc.project.bpm, getBuffer);
    }
  }

  private async schedulePlayer(clip: Clip, lane: Lane, bpm: number, getBuffer: BufferFn): Promise<void> {
    if (!clip.assetId) return;
    try {
      const bytes = await getBuffer(clip.assetId);
      const ctx = Tone.getContext();
      const audio = await ctx.decodeAudioData(bytes.slice(0));
      const player = new Tone.Player({
        url: audio,
        fadeIn: clip.fadeInSec,
        fadeOut: clip.fadeOutSec,
      });
      player.volume.value = clip.gainDb;
      player.connect(this.channelFor(lane));
      const startSec = beatsToSec(clip.startBeats, bpm);
      const durSec = beatsToSec(clip.lengthBeats, bpm);
      player.sync().start(startSec, clip.cueInSec, durSec);
      this.players.set(clip.id, player);
    } catch (err) {
      console.warn("schedule player failed", clip.id, err);
    }
  }

  private scheduleSynth(clip: Clip, lane: Lane, bpm: number): void {
    const config = parseSynthConfig(lane.synthConfig);
    const notes = parseSynthPattern(clip.synthPattern);
    const inst = makeInstrument(config.type);
    inst.connect(this.channelFor(lane));
    this.instruments.set(clip.id, inst);
    const part = new Tone.Part((time, ev: { note: string; durBeats: number; vel: number }) => {
      inst.triggerAttackRelease(ev.note, beatsToSec(ev.durBeats, bpm), time, ev.vel);
    }, notes.map((note) => ({ time: beatsToSec(note.timeBeats, bpm), note: note.note, durBeats: note.durBeats, vel: note.vel ?? 0.8 })));
    part.start(beatsToSec(clip.startBeats, bpm));
    this.parts.set(clip.id, part);
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

  invalidateSchedule(): void {
    this.scheduleKey = "";
  }
}

export const toneEngine = new ToneEngine();
