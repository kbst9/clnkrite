import { newId } from "../shared/ids";
import { INGEST_STALE_MS, ingestClaimStale, isTerminalJobStatus } from "../shared/jobs";
import type {
  Asset,
  Clip,
  CreateLaneInput,
  CreateProjectInput,
  Job,
  JobParams,
  JobStatus,
  Lane,
  LaneKind,
  PatchLaneInput,
  PatchProjectInput,
  Project,
  ProjectDocument,
  ProjectSummary,
} from "../shared/types";
import { LANE_KIND_NAMES } from "../shared/types";

export interface Store {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  updateProject(id: string, patch: PatchProjectInput): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  getDocument(id: string): Promise<ProjectDocument | null>;

  createLane(projectId: string, input: CreateLaneInput): Promise<Lane | null>;
  getLane(id: string): Promise<Lane | null>;
  updateLane(id: string, patch: PatchLaneInput): Promise<Lane | null>;
  deleteLane(id: string): Promise<boolean>;
  armLane(projectId: string, laneId: string): Promise<void>;
  nextSortOrder(projectId: string): Promise<number>;

  createAsset(asset: Asset): Promise<Asset>;
  getAsset(id: string): Promise<Asset | null>;
  getAssetBySourceJobId(jobId: string): Promise<Asset | null>;
  updateAssetPeaks(id: string, peaksR2Key: string): Promise<Asset | null>;

  createClip(clip: Clip): Promise<Clip>;
  getClip(id: string): Promise<Clip | null>;
  updateClip(id: string, patch: Partial<Clip>): Promise<Clip | null>;
  deleteClip(id: string): Promise<boolean>;
  listClipsForProject(projectId: string): Promise<Clip[]>;
  listClipsByAssetId(assetId: string): Promise<Clip[]>;
  listAssetsBySourceJobId(jobId: string): Promise<Asset[]>;

  createJob(job: Job): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  claimJobForIngest(id: string): Promise<{ claimed: boolean; job: Job | null }>;
  updateJob(
    id: string,
    patch: Partial<Pick<Job, "status" | "bridgeJobId" | "error" | "resultAssetIds" | "updatedAt">>,
  ): Promise<Job | null>;
}

function now(): number {
  return Date.now();
}

function defaultProject(input: CreateProjectInput): Project {
  const t = now();
  return {
    id: newId(),
    title: input.title?.trim() || "Untitled",
    bpm: input.bpm ?? 120,
    keySig: input.keySig ?? "C major",
    timeSig: input.timeSig ?? "4/4",
    vibe: input.vibe ?? "",
    lengthBeats: input.lengthBeats ?? 128,
    loopStartBeats: null,
    loopEndBeats: null,
    createdAt: t,
    updatedAt: t,
  };
}

function defaultLane(projectId: string, input: CreateLaneInput, sortOrder: number): Lane {
  const t = now();
  const synthConfig =
    input.synthConfig !== undefined
      ? input.synthConfig
      : input.kind === "synth"
        ? JSON.stringify({ type: "PolySynth" })
        : null;
  return {
    id: input.id ?? newId(),
    projectId,
    kind: input.kind,
    name: input.name?.trim() || LANE_KIND_NAMES[input.kind],
    sortOrder: input.sortOrder ?? sortOrder,
    muted: Boolean(input.muted),
    soloed: false,
    volumeDb: 0,
    pan: 0,
    armed: Boolean(input.arm),
    visible: true,
    parentLaneId: input.parentLaneId ?? null,
    stemRole: input.stemRole ?? null,
    synthConfig,
    createdAt: t,
    updatedAt: t,
  };
}

export function createMemoryStore(): Store {
  const projects = new Map<string, Project>();
  const lanes = new Map<string, Lane>();
  const assets = new Map<string, Asset>();
  const clips = new Map<string, Clip>();
  const jobs = new Map<string, Job>();

  const store: Store = {
    async listProjects() {
      return [...projects.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => ({
          id: p.id,
          title: p.title,
          bpm: p.bpm,
          keySig: p.keySig,
          timeSig: p.timeSig,
          vibe: p.vibe,
          updatedAt: p.updatedAt,
        }));
    },
    async createProject(input) {
      const project = defaultProject(input);
      projects.set(project.id, project);
      return project;
    },
    async getProject(id) {
      return projects.get(id) ?? null;
    },
    async updateProject(id, patch) {
      const current = projects.get(id);
      if (!current) return null;
      const next: Project = {
        ...current,
        title: patch.title ?? current.title,
        bpm: patch.bpm ?? current.bpm,
        keySig: patch.keySig ?? current.keySig,
        timeSig: patch.timeSig ?? current.timeSig,
        vibe: patch.vibe ?? current.vibe,
        lengthBeats: patch.lengthBeats ?? current.lengthBeats,
        loopStartBeats: patch.loopStartBeats === undefined ? current.loopStartBeats : patch.loopStartBeats,
        loopEndBeats: patch.loopEndBeats === undefined ? current.loopEndBeats : patch.loopEndBeats,
        updatedAt: now(),
      };
      projects.set(id, next);
      return next;
    },
    async deleteProject(id) {
      if (!projects.has(id)) return false;
      const projectLaneIds = new Set(
        [...lanes.values()].filter((lane) => lane.projectId === id).map((lane) => lane.id),
      );
      projects.delete(id);
      for (const [cid, clip] of clips) if (projectLaneIds.has(clip.laneId)) clips.delete(cid);
      for (const [aid, asset] of assets) if (asset.projectId === id) assets.delete(aid);
      for (const [jid, job] of jobs) if (job.projectId === id) jobs.delete(jid);
      for (const laneId of projectLaneIds) lanes.delete(laneId);
      return true;
    },
    async getDocument(id) {
      const project = projects.get(id);
      if (!project) return null;
      const projectLanes = [...lanes.values()]
        .filter((l) => l.projectId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const laneIds = new Set(projectLanes.map((l) => l.id));
      const projectClips = [...clips.values()].filter((c) => laneIds.has(c.laneId));
      const projectAssets = [...assets.values()].filter((a) => a.projectId === id);
      const projectJobs = [...jobs.values()].filter((j) => j.projectId === id && !isTerminalJobStatus(j.status));
      return { project, lanes: projectLanes, clips: projectClips, assets: projectAssets, jobs: projectJobs };
    },
    async nextSortOrder(projectId) {
      let max = -1;
      for (const lane of lanes.values()) {
        if (lane.projectId === projectId) max = Math.max(max, lane.sortOrder);
      }
      return max + 1;
    },
    async createLane(projectId, input) {
      if (!projects.has(projectId)) return null;
      if (input.kind === "picture") {
        for (const [id, lane] of [...lanes]) {
          if (lane.projectId === projectId && lane.kind === "picture") await store.deleteLane(id);
        }
      }
      const sortOrder = input.sortOrder ?? (await store.nextSortOrder(projectId));
      const shouldArm = input.arm ?? (input.kind === "music3" || input.kind === "acestep");
      const lane = defaultLane(projectId, { ...input, arm: shouldArm }, sortOrder);
      lanes.set(lane.id, lane);
      if (lane.armed) await store.armLane(projectId, lane.id);
      return lanes.get(lane.id) ?? lane;
    },
    async getLane(id) {
      return lanes.get(id) ?? null;
    },
    async updateLane(id, patch) {
      const current = lanes.get(id);
      if (!current) return null;
      if (patch.armed === true) {
        await store.armLane(current.projectId, id);
      }
      const fresh = lanes.get(id)!;
      const next: Lane = {
        ...fresh,
        name: patch.name ?? fresh.name,
        sortOrder: patch.sortOrder ?? fresh.sortOrder,
        muted: patch.muted ?? fresh.muted,
        soloed: patch.soloed ?? fresh.soloed,
        volumeDb: patch.volumeDb ?? fresh.volumeDb,
        pan: patch.pan ?? fresh.pan,
        armed: patch.armed === false ? false : fresh.armed,
        visible: patch.visible ?? fresh.visible,
        synthConfig: patch.synthConfig === undefined ? fresh.synthConfig : patch.synthConfig,
        updatedAt: now(),
      };
      lanes.set(id, next);
      return next;
    },
    async deleteLane(id) {
      const lane = lanes.get(id);
      if (!lane) return false;
      lanes.delete(id);
      for (const [cid, clip] of clips) if (clip.laneId === id) clips.delete(cid);
      return true;
    },
    async armLane(projectId, laneId) {
      const t = now();
      for (const [id, lane] of lanes) {
        if (lane.projectId !== projectId) continue;
        lanes.set(id, { ...lane, armed: id === laneId, updatedAt: t });
      }
    },
    async createAsset(asset) {
      assets.set(asset.id, asset);
      return asset;
    },
    async getAsset(id) {
      return assets.get(id) ?? null;
    },
    async getAssetBySourceJobId(jobId) {
      return [...assets.values()].find((asset) => asset.sourceJobId === jobId) ?? null;
    },
    async updateAssetPeaks(id, peaksR2Key) {
      const current = assets.get(id);
      if (!current) return null;
      const next = { ...current, peaksR2Key };
      assets.set(id, next);
      return next;
    },
    async createClip(clip) {
      clips.set(clip.id, clip);
      return clip;
    },
    async getClip(id) {
      return clips.get(id) ?? null;
    },
    async updateClip(id, patch) {
      const current = clips.get(id);
      if (!current) return null;
      const next: Clip = { ...current, ...patch, id: current.id, updatedAt: now() };
      clips.set(id, next);
      return next;
    },
    async deleteClip(id) {
      return clips.delete(id);
    },
    async listClipsByAssetId(assetId) {
      return [...clips.values()].filter((clip) => clip.assetId === assetId);
    },
    async listAssetsBySourceJobId(jobId) {
      return [...assets.values()].filter((asset) => asset.sourceJobId === jobId);
    },
    async listClipsForProject(projectId) {
      const laneIds = new Set(
        [...lanes.values()].filter((l) => l.projectId === projectId).map((l) => l.id),
      );
      return [...clips.values()].filter((c) => laneIds.has(c.laneId));
    },
    async createJob(job) {
      jobs.set(job.id, job);
      return job;
    },
    async getJob(id) {
      return jobs.get(id) ?? null;
    },
    async claimJobForIngest(id) {
      const current = jobs.get(id) ?? null;
      if (!current) return { claimed: false, job: null };
      const claimable =
        current.status === "queued" ||
        current.status === "running" ||
        (current.status === "ingesting" && ingestClaimStale(current.updatedAt));
      if (!claimable) return { claimed: false, job: current };
      const job = { ...current, status: "ingesting" as const, updatedAt: now() };
      jobs.set(id, job);
      return { claimed: true, job };
    },
    async updateJob(id, patch) {
      const current = jobs.get(id);
      if (!current) return null;
      const next: Job = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? now(),
      };
      jobs.set(id, next);
      return next;
    },
  };
  return store;
}

interface ProjectRow {
  id: string;
  title: string;
  bpm: number;
  key_sig: string;
  time_sig: string;
  vibe: string;
  length_beats: number;
  loop_start_beats: number | null;
  loop_end_beats: number | null;
  created_at: number;
  updated_at: number;
}

interface LaneRow {
  id: string;
  project_id: string;
  kind: LaneKind;
  name: string;
  sort_order: number;
  muted: number;
  soloed: number;
  volume_db: number;
  pan: number;
  armed: number;
  visible: number;
  parent_lane_id: string | null;
  stem_role: string | null;
  synth_config: string | null;
  created_at: number;
  updated_at: number;
}

interface AssetRow {
  id: string;
  project_id: string;
  kind: Asset["kind"];
  r2_key: string;
  mime: string;
  bytes: number;
  duration_sec: number | null;
  sample_rate: number | null;
  channels: number | null;
  source: Asset["source"];
  source_job_id: string | null;
  peaks_r2_key: string | null;
  created_at: number;
}

interface ClipRow {
  id: string;
  lane_id: string;
  asset_id: string | null;
  start_beats: number;
  length_beats: number;
  cue_in_sec: number;
  fade_in_sec: number;
  fade_out_sec: number;
  gain_db: number;
  synth_pattern: string | null;
  label: string | null;
  created_at: number;
  updated_at: number;
}

interface JobRow {
  id: string;
  project_id: string;
  lane_id: string | null;
  kind: Job["kind"];
  params: string;
  status: JobStatus;
  bridge_job_id: string | null;
  error: string | null;
  result_asset_ids: string | null;
  created_at: number;
  updated_at: number;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    bpm: row.bpm,
    keySig: row.key_sig,
    timeSig: row.time_sig,
    vibe: row.vibe,
    lengthBeats: row.length_beats,
    loopStartBeats: row.loop_start_beats,
    loopEndBeats: row.loop_end_beats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLane(row: LaneRow): Lane {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    sortOrder: row.sort_order,
    muted: Boolean(row.muted),
    soloed: Boolean(row.soloed),
    volumeDb: row.volume_db,
    pan: row.pan,
    armed: Boolean(row.armed),
    visible: Boolean(row.visible),
    parentLaneId: row.parent_lane_id,
    stemRole: (row.stem_role as Lane["stemRole"]) ?? null,
    synthConfig: row.synth_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    r2Key: row.r2_key,
    mime: row.mime,
    bytes: row.bytes,
    durationSec: row.duration_sec,
    sampleRate: row.sample_rate,
    channels: row.channels,
    source: row.source,
    sourceJobId: row.source_job_id,
    peaksR2Key: row.peaks_r2_key,
    createdAt: row.created_at,
  };
}

function mapClip(row: ClipRow): Clip {
  return {
    id: row.id,
    laneId: row.lane_id,
    assetId: row.asset_id,
    startBeats: row.start_beats,
    lengthBeats: row.length_beats,
    cueInSec: row.cue_in_sec,
    fadeInSec: row.fade_in_sec,
    fadeOutSec: row.fade_out_sec,
    gainDb: row.gain_db,
    synthPattern: row.synth_pattern,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: JobRow): Job {
  let params: JobParams = {};
  let resultAssetIds: string[] = [];
  try {
    params = JSON.parse(row.params) as JobParams;
  } catch {
    params = {};
  }
  try {
    resultAssetIds = row.result_asset_ids ? (JSON.parse(row.result_asset_ids) as string[]) : [];
  } catch {
    resultAssetIds = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    laneId: row.lane_id,
    kind: row.kind,
    params,
    status: row.status,
    bridgeJobId: row.bridge_job_id,
    error: row.error,
    resultAssetIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createD1Store(db: D1Database): Store {
  const store: Store = {
    async listProjects() {
      const { results } = await db
        .prepare(
          `SELECT id, title, bpm, key_sig, time_sig, vibe, length_beats, loop_start_beats, loop_end_beats, created_at, updated_at
           FROM projects ORDER BY updated_at DESC`,
        )
        .all<ProjectRow>();
      return (results ?? []).map((row) => {
        const p = mapProject(row);
        return {
          id: p.id,
          title: p.title,
          bpm: p.bpm,
          keySig: p.keySig,
          timeSig: p.timeSig,
          vibe: p.vibe,
          updatedAt: p.updatedAt,
        };
      });
    },
    async createProject(input) {
      const project = defaultProject(input);
      await db
        .prepare(
          `INSERT INTO projects (id, title, bpm, key_sig, time_sig, vibe, length_beats, loop_start_beats, loop_end_beats, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          project.id,
          project.title,
          project.bpm,
          project.keySig,
          project.timeSig,
          project.vibe,
          project.lengthBeats,
          project.loopStartBeats,
          project.loopEndBeats,
          project.createdAt,
          project.updatedAt,
        )
        .run();
      return project;
    },
    async getProject(id) {
      const row = await db
        .prepare(
          `SELECT id, title, bpm, key_sig, time_sig, vibe, length_beats, loop_start_beats, loop_end_beats, created_at, updated_at
           FROM projects WHERE id = ?`,
        )
        .bind(id)
        .first<ProjectRow>();
      return row ? mapProject(row) : null;
    },
    async updateProject(id, patch) {
      const current = await store.getProject(id);
      if (!current) return null;
      const next: Project = {
        ...current,
        title: patch.title ?? current.title,
        bpm: patch.bpm ?? current.bpm,
        keySig: patch.keySig ?? current.keySig,
        timeSig: patch.timeSig ?? current.timeSig,
        vibe: patch.vibe ?? current.vibe,
        lengthBeats: patch.lengthBeats ?? current.lengthBeats,
        loopStartBeats: patch.loopStartBeats === undefined ? current.loopStartBeats : patch.loopStartBeats,
        loopEndBeats: patch.loopEndBeats === undefined ? current.loopEndBeats : patch.loopEndBeats,
        updatedAt: now(),
      };
      await db
        .prepare(
          `UPDATE projects SET title=?, bpm=?, key_sig=?, time_sig=?, vibe=?, length_beats=?, loop_start_beats=?, loop_end_beats=?, updated_at=?
           WHERE id=?`,
        )
        .bind(
          next.title,
          next.bpm,
          next.keySig,
          next.timeSig,
          next.vibe,
          next.lengthBeats,
          next.loopStartBeats,
          next.loopEndBeats,
          next.updatedAt,
          id,
        )
        .run();
      return next;
    },
    async deleteProject(id) {
      const existing = await store.getProject(id);
      if (!existing) return false;
      await db.prepare(`DELETE FROM jobs WHERE project_id = ?`).bind(id).run();
      await db
        .prepare(
          `DELETE FROM clips WHERE lane_id IN (SELECT id FROM lanes WHERE project_id = ?)`,
        )
        .bind(id)
        .run();
      await db.prepare(`DELETE FROM assets WHERE project_id = ?`).bind(id).run();
      await db.prepare(`DELETE FROM lanes WHERE project_id = ?`).bind(id).run();
      await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
      return true;
    },
    async getDocument(id) {
      const project = await store.getProject(id);
      if (!project) return null;
      const laneRes = await db
        .prepare(`SELECT * FROM lanes WHERE project_id = ? ORDER BY sort_order`)
        .bind(id)
        .all<LaneRow>();
      const projectLanes = (laneRes.results ?? []).map(mapLane);
      const clipRes = await db
        .prepare(
          `SELECT clips.* FROM clips JOIN lanes ON clips.lane_id = lanes.id WHERE lanes.project_id = ? ORDER BY clips.start_beats`,
        )
        .bind(id)
        .all<ClipRow>();
      const assetRes = await db.prepare(`SELECT * FROM assets WHERE project_id = ?`).bind(id).all<AssetRow>();
      const jobRes = await db
        .prepare(
          `SELECT * FROM jobs WHERE project_id = ? AND status NOT IN ('succeeded','failed','cancelled') ORDER BY created_at`,
        )
        .bind(id)
        .all<JobRow>();
      return {
        project,
        lanes: projectLanes,
        clips: (clipRes.results ?? []).map(mapClip),
        assets: (assetRes.results ?? []).map(mapAsset),
        jobs: (jobRes.results ?? []).map(mapJob),
      };
    },
    async nextSortOrder(projectId) {
      const row = await db
        .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM lanes WHERE project_id = ?`)
        .bind(projectId)
        .first<{ m: number }>();
      return (row?.m ?? -1) + 1;
    },
    async createLane(projectId, input) {
      const project = await store.getProject(projectId);
      if (!project) return null;
      if (input.kind === "picture") {
        const existing = await db
          .prepare(`SELECT id FROM lanes WHERE project_id = ? AND kind = 'picture'`)
          .bind(projectId)
          .all<{ id: string }>();
        for (const row of existing.results ?? []) await store.deleteLane(row.id);
      }
      const sortOrder = input.sortOrder ?? (await store.nextSortOrder(projectId));
      const shouldArm = input.arm ?? (input.kind === "music3" || input.kind === "acestep");
      const lane = defaultLane(projectId, { ...input, arm: shouldArm }, sortOrder);
      await db
        .prepare(
          `INSERT INTO lanes (id, project_id, kind, name, sort_order, muted, soloed, volume_db, pan, armed, visible, parent_lane_id, stem_role, synth_config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          lane.id,
          lane.projectId,
          lane.kind,
          lane.name,
          lane.sortOrder,
          lane.muted ? 1 : 0,
          lane.soloed ? 1 : 0,
          lane.volumeDb,
          lane.pan,
          lane.armed ? 1 : 0,
          lane.visible ? 1 : 0,
          lane.parentLaneId,
          lane.stemRole,
          lane.synthConfig,
          lane.createdAt,
          lane.updatedAt,
        )
        .run();
      if (lane.armed) await store.armLane(projectId, lane.id);
      return (await store.getLane(lane.id)) ?? lane;
    },
    async getLane(id) {
      const row = await db.prepare(`SELECT * FROM lanes WHERE id = ?`).bind(id).first<LaneRow>();
      return row ? mapLane(row) : null;
    },
    async updateLane(id, patch) {
      const current = await store.getLane(id);
      if (!current) return null;
      if (patch.armed === true) {
        await store.armLane(current.projectId, id);
      }
      const fresh = (await store.getLane(id))!;
      const next: Lane = {
        ...fresh,
        name: patch.name ?? fresh.name,
        sortOrder: patch.sortOrder ?? fresh.sortOrder,
        muted: patch.muted ?? fresh.muted,
        soloed: patch.soloed ?? fresh.soloed,
        volumeDb: patch.volumeDb ?? fresh.volumeDb,
        pan: patch.pan ?? fresh.pan,
        armed: patch.armed === false ? false : fresh.armed,
        visible: patch.visible ?? fresh.visible,
        synthConfig: patch.synthConfig === undefined ? fresh.synthConfig : patch.synthConfig,
        updatedAt: now(),
      };
      await db
        .prepare(
          `UPDATE lanes SET name=?, sort_order=?, muted=?, soloed=?, volume_db=?, pan=?, armed=?, visible=?, synth_config=?, updated_at=?
           WHERE id=?`,
        )
        .bind(
          next.name,
          next.sortOrder,
          next.muted ? 1 : 0,
          next.soloed ? 1 : 0,
          next.volumeDb,
          next.pan,
          next.armed ? 1 : 0,
          next.visible ? 1 : 0,
          next.synthConfig,
          next.updatedAt,
          id,
        )
        .run();
      return next;
    },
    async deleteLane(id) {
      const existing = await store.getLane(id);
      if (!existing) return false;
      await db.prepare(`DELETE FROM clips WHERE lane_id = ?`).bind(id).run();
      await db.prepare(`DELETE FROM lanes WHERE id = ?`).bind(id).run();
      return true;
    },
    async armLane(projectId, laneId) {
      const t = now();
      await db
        .prepare(`UPDATE lanes SET armed = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = ? WHERE project_id = ?`)
        .bind(laneId, t, projectId)
        .run();
    },
    async createAsset(asset) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO assets (id, project_id, kind, r2_key, mime, bytes, duration_sec, sample_rate, channels, source, source_job_id, peaks_r2_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          asset.id,
          asset.projectId,
          asset.kind,
          asset.r2Key,
          asset.mime,
          asset.bytes,
          asset.durationSec,
          asset.sampleRate,
          asset.channels,
          asset.source,
          asset.sourceJobId,
          asset.peaksR2Key,
          asset.createdAt,
        )
        .run();
      return (await store.getAsset(asset.id)) ?? asset;
    },
    async getAsset(id) {
      const row = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(id).first<AssetRow>();
      return row ? mapAsset(row) : null;
    },
    async getAssetBySourceJobId(jobId) {
      const row = await db
        .prepare(`SELECT * FROM assets WHERE source_job_id = ? LIMIT 1`)
        .bind(jobId)
        .first<AssetRow>();
      return row ? mapAsset(row) : null;
    },
    async updateAssetPeaks(id, peaksR2Key) {
      const current = await store.getAsset(id);
      if (!current) return null;
      await db.prepare(`UPDATE assets SET peaks_r2_key = ? WHERE id = ?`).bind(peaksR2Key, id).run();
      return { ...current, peaksR2Key };
    },
    async createClip(clip) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO clips (id, lane_id, asset_id, start_beats, length_beats, cue_in_sec, fade_in_sec, fade_out_sec, gain_db, synth_pattern, label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          clip.id,
          clip.laneId,
          clip.assetId,
          clip.startBeats,
          clip.lengthBeats,
          clip.cueInSec,
          clip.fadeInSec,
          clip.fadeOutSec,
          clip.gainDb,
          clip.synthPattern,
          clip.label,
          clip.createdAt,
          clip.updatedAt,
        )
        .run();
      return clip;
    },
    async getClip(id) {
      const row = await db.prepare(`SELECT * FROM clips WHERE id = ?`).bind(id).first<ClipRow>();
      return row ? mapClip(row) : null;
    },
    async updateClip(id, patch) {
      const current = await store.getClip(id);
      if (!current) return null;
      const next: Clip = { ...current, ...patch, id: current.id, updatedAt: now() };
      await db
        .prepare(
          `UPDATE clips SET lane_id=?, asset_id=?, start_beats=?, length_beats=?, cue_in_sec=?, fade_in_sec=?, fade_out_sec=?, gain_db=?, synth_pattern=?, label=?, updated_at=?
           WHERE id=?`,
        )
        .bind(
          next.laneId,
          next.assetId,
          next.startBeats,
          next.lengthBeats,
          next.cueInSec,
          next.fadeInSec,
          next.fadeOutSec,
          next.gainDb,
          next.synthPattern,
          next.label,
          next.updatedAt,
          id,
        )
        .run();
      return next;
    },
    async deleteClip(id) {
      const existing = await store.getClip(id);
      if (!existing) return false;
      await db.prepare(`DELETE FROM clips WHERE id = ?`).bind(id).run();
      return true;
    },
    async listClipsByAssetId(assetId) {
      const { results } = await db.prepare(`SELECT * FROM clips WHERE asset_id = ?`).bind(assetId).all<ClipRow>();
      return (results ?? []).map(mapClip);
    },
    async listAssetsBySourceJobId(jobId) {
      const { results } = await db.prepare(`SELECT * FROM assets WHERE source_job_id = ?`).bind(jobId).all<AssetRow>();
      return (results ?? []).map(mapAsset);
    },
    async listClipsForProject(projectId) {
      const { results } = await db
        .prepare(
          `SELECT clips.* FROM clips JOIN lanes ON clips.lane_id = lanes.id WHERE lanes.project_id = ?`,
        )
        .bind(projectId)
        .all<ClipRow>();
      return (results ?? []).map(mapClip);
    },
    async createJob(job) {
      await db
        .prepare(
          `INSERT INTO jobs (id, project_id, lane_id, kind, params, status, bridge_job_id, error, result_asset_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          job.id,
          job.projectId,
          job.laneId,
          job.kind,
          JSON.stringify(job.params),
          job.status,
          job.bridgeJobId,
          job.error,
          JSON.stringify(job.resultAssetIds),
          job.createdAt,
          job.updatedAt,
        )
        .run();
      return job;
    },
    async getJob(id) {
      const row = await db.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(id).first<JobRow>();
      return row ? mapJob(row) : null;
    },
    async claimJobForIngest(id) {
      const updatedAt = now();
      const staleBefore = updatedAt - INGEST_STALE_MS;
      const result = await db
        .prepare(
          `UPDATE jobs SET status = 'ingesting', updated_at = ?
           WHERE id = ? AND (
             status IN ('queued', 'running')
             OR (status = 'ingesting' AND updated_at <= ?)
           )`,
        )
        .bind(updatedAt, id, staleBefore)
        .run();
      return {
        claimed: (result.meta.changes ?? 0) === 1,
        job: await store.getJob(id),
      };
    },
    async updateJob(id, patch) {
      const current = await store.getJob(id);
      if (!current) return null;
      const next: Job = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? now(),
      };
      await db
        .prepare(
          `UPDATE jobs SET status=?, bridge_job_id=?, error=?, result_asset_ids=?, updated_at=? WHERE id=?`,
        )
        .bind(
          next.status,
          next.bridgeJobId,
          next.error,
          JSON.stringify(next.resultAssetIds),
          next.updatedAt,
          id,
        )
        .run();
      return next;
    },
  };
  return store;
}
