import type { Asset, Clip, Lane, StemRole } from "./types";
import { STEM_ROLES } from "./types";

export function stemLaneName(parentName: string, role: StemRole): string {
  return `${parentName} — ${role}`;
}

export interface StemArtifact {
  role: StemRole;
  assetId: string;
  r2Key: string;
  bytes: number;
  durationSec: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface StemExplodeInput {
  jobId: string;
  projectId: string;
  parentLane: Lane;
  sourceClip: Clip;
  artifacts: StemArtifact[];
  now?: number;
}

export interface StemExplodePlan {
  muteParent: boolean;
  lanes: Lane[];
  clips: Clip[];
  assets: Asset[];
}

export function planStemExplode(input: StemExplodeInput): StemExplodePlan {
  const t = input.now ?? Date.now();
  const lanes: Lane[] = [];
  const clips: Clip[] = [];
  const assets: Asset[] = [];
  const artifacts = new Map(input.artifacts.map((artifact) => [artifact.role, artifact]));
  for (const [index, role] of STEM_ROLES.entries()) {
    const art = artifacts.get(role);
    if (!art) throw new Error(`missing_stem:${role}`);
    const laneId = `stem-${input.parentLane.id}-lane-${role}`;
    lanes.push({
      id: laneId,
      projectId: input.projectId,
      kind: "import",
      name: stemLaneName(input.parentLane.name, role),
      sortOrder: input.parentLane.sortOrder + index + 1,
      muted: false,
      soloed: false,
      volumeDb: 0,
      pan: 0,
      armed: false,
      visible: true,
      parentLaneId: input.parentLane.id,
      stemRole: role,
      synthConfig: null,
      createdAt: t,
      updatedAt: t,
    });
    assets.push({
      id: art.assetId,
      projectId: input.projectId,
      kind: "audio",
      r2Key: art.r2Key,
      mime: "audio/wav",
      bytes: art.bytes,
      durationSec: art.durationSec,
      sampleRate: art.sampleRate,
      channels: art.channels,
      source: "demucs",
      sourceJobId: input.jobId,
      peaksR2Key: null,
      createdAt: t,
    });
    clips.push({
      id: `job-${input.jobId}-clip-${art.role}`,
      laneId,
      assetId: art.assetId,
      startBeats: input.sourceClip.startBeats,
      lengthBeats: input.sourceClip.lengthBeats,
      cueInSec: input.sourceClip.cueInSec,
      fadeInSec: input.sourceClip.fadeInSec,
      fadeOutSec: input.sourceClip.fadeOutSec,
      gainDb: input.sourceClip.gainDb,
      synthPattern: null,
      label: art.role,
      createdAt: t,
      updatedAt: t,
    });
  }
  return { muteParent: true, lanes, clips, assets };
}

export function defaultStemRoles(): StemRole[] {
  return [...STEM_ROLES];
}

/** Lane-header stems badge: exclusive parent vs children. Never both unmuted. */
export function nextStemHeaderMute(parentMuted: boolean): { parentMuted: boolean; childrenMuted: boolean } {
  if (parentMuted) {
    return { parentMuted: false, childrenMuted: true };
  }
  return { parentMuted: true, childrenMuted: false };
}
