export type LaneKind = "music3" | "acestep" | "synth" | "import" | "picture";
export type AssetKind = "audio" | "video";
export type AssetSource = "music3" | "acestep" | "import" | "demucs" | "video";
export type JobKind = "music3_generate" | "acestep_generate" | "demucs_split";
export type JobStatus = "queued" | "running" | "ingesting" | "succeeded" | "failed" | "cancelled";
export type BridgeJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type StemRole = "vocals" | "drums" | "bass" | "other";

export interface Project {
  id: string;
  title: string;
  bpm: number;
  keySig: string;
  timeSig: string;
  vibe: string;
  lengthBeats: number;
  loopStartBeats: number | null;
  loopEndBeats: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Lane {
  id: string;
  projectId: string;
  kind: LaneKind;
  name: string;
  sortOrder: number;
  muted: boolean;
  soloed: boolean;
  volumeDb: number;
  pan: number;
  armed: boolean;
  visible: boolean;
  parentLaneId: string | null;
  stemRole: StemRole | null;
  synthConfig: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  r2Key: string;
  mime: string;
  bytes: number;
  durationSec: number | null;
  sampleRate: number | null;
  channels: number | null;
  source: AssetSource;
  sourceJobId: string | null;
  peaksR2Key: string | null;
  createdAt: number;
}

export interface Clip {
  id: string;
  laneId: string;
  assetId: string | null;
  startBeats: number;
  lengthBeats: number;
  cueInSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  gainDb: number;
  synthPattern: string | null;
  label: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Music3JobParams {
  lyrics: string;
  caption: string;
  seed: number;
  durationSec: number;
  playheadBeats: number;
  model?: string;
}

export interface AceStepJobParams {
  prompt: string;
  lyrics: string;
  audioDuration: number;
  bpm: number;
  seed: number;
  inferenceSteps: number;
  playheadBeats: number;
}

export interface DemucsJobParams {
  sourceAssetId: string;
  sourceClipId?: string;
  playheadBeats: number;
}

export type JobParams = Music3JobParams | AceStepJobParams | DemucsJobParams | Record<string, unknown>;

export interface Job {
  id: string;
  projectId: string;
  laneId: string | null;
  kind: JobKind;
  params: JobParams;
  status: JobStatus;
  bridgeJobId: string | null;
  error: string | null;
  resultAssetIds: string[];
  createdAt: number;
  updatedAt: number;
  queuePosition?: number;
  progress?: number | null;
}

export interface ProjectDocument {
  project: Project;
  lanes: Lane[];
  clips: Clip[];
  assets: Asset[];
  jobs: Job[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  bpm: number;
  keySig: string;
  timeSig: string;
  vibe: string;
  updatedAt: number;
}

export interface CreateProjectInput {
  title?: string;
  bpm?: number;
  keySig?: string;
  timeSig?: string;
  vibe?: string;
  lengthBeats?: number;
}

export interface PatchProjectInput {
  title?: string;
  bpm?: number;
  keySig?: string;
  timeSig?: string;
  vibe?: string;
  lengthBeats?: number;
  loopStartBeats?: number | null;
  loopEndBeats?: number | null;
}

export type SynthType = "PolySynth" | "MonoSynth" | "FMSynth" | "MembraneSynth";

export interface SynthNote {
  timeBeats: number;
  note: string;
  durBeats: number;
  vel: number;
}

export interface SynthConfig {
  type: SynthType;
}

export interface CreateLaneInput {
  kind: LaneKind;
  name?: string;
  arm?: boolean;
  id?: string;
  parentLaneId?: string | null;
  stemRole?: StemRole | null;
  synthConfig?: string | null;
  muted?: boolean;
  sortOrder?: number;
}

export interface PatchLaneInput {
  name?: string;
  sortOrder?: number;
  muted?: boolean;
  soloed?: boolean;
  volumeDb?: number;
  pan?: number;
  armed?: boolean;
  visible?: boolean;
  synthConfig?: string | null;
  parentLaneId?: string | null;
  stemRole?: StemRole | null;
}

export interface CreateClipInput {
  id?: string;
  laneId?: string;
  assetId?: string | null;
  startBeats: number;
  lengthBeats: number;
  cueInSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  gainDb?: number;
  synthPattern?: string | null;
  label?: string | null;
}

export interface PatchClipInput {
  laneId?: string;
  startBeats?: number;
  lengthBeats?: number;
  cueInSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  gainDb?: number;
  synthPattern?: string | null;
  label?: string | null;
}

export interface SplitClipInput {
  atBeats: number;
}

export interface CreateJobInput {
  kind: JobKind;
  laneId?: string;
  params: JobParams;
}

export interface BridgeHealth {
  music3: { up: boolean; model: string | null };
  acestep: { up: boolean } | null;
  demucs: { available: boolean };
  queue: { depth: number; running: boolean };
}

export interface EnginesResponse {
  online: boolean;
  error?: "bridge_offline" | "h3_offline";
  health: BridgeHealth | null;
  kv: unknown;
}

export interface BridgeJobView {
  status: BridgeJobStatus;
  queuePosition: number;
  progress?: number;
  error?: string;
  artifacts?: Array<{ name: string; bytes: number; durationSec?: number }>;
}

export const LANE_KIND_NAMES: Record<LaneKind, string> = {
  music3: "Music3",
  acestep: "ACE-Step",
  synth: "Synth",
  import: "Import",
  picture: "Picture",
};

export const SECTION_TAGS = [
  "[Intro]",
  "[Verse]",
  "[Pre-Chorus]",
  "[Chorus]",
  "[Post-Chorus]",
  "[Bridge]",
  "[Instrumental]",
  "[Solo]",
  "[Outro]",
] as const;

export const AUDIO_MIME_ALLOWLIST = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
] as const;

export const VIDEO_MIME_ALLOWLIST = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const MAX_AUDIO_BYTES = 128 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

export const STEM_ROLES: StemRole[] = ["vocals", "drums", "bass", "other"];
