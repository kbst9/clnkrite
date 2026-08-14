import { create } from "zustand";
import { copyClip, cropClip, moveClip, nudgeClip, setFades, slipClip, splitClip } from "@shared/clipOps";
import { newId } from "@shared/ids";
import { defaultSynthConfig, stringifySynthPattern } from "@shared/synth";
import type {
  Clip,
  CreateLaneInput,
  CreateProjectInput,
  Lane,
  PatchLaneInput,
  PatchClipInput,
  PatchProjectInput,
  Project,
  ProjectDocument,
  ProjectSummary,
} from "@shared/types";
import { LANE_KIND_NAMES } from "@shared/types";
import { toneEngine } from "../engine/toneEngine";
import { ApiError, api } from "../lib/api";
import { undoStack } from "../lib/undo";
import { attachFlushListeners, WriteQueue } from "../lib/writeQueue";

const queue = new WriteQueue(500);
const projectPatches = new Map<string, PatchProjectInput>();
const lanePatches = new Map<string, PatchLaneInput>();
const clipPatches = new Map<string, PatchClipInput>();
const persistedClipIds = new Set<string>();
let flushBound = false;

function restorePatch<T extends object>(pending: Map<string, T>, id: string, sent: T): void {
  pending.set(id, { ...sent, ...pending.get(id) });
}

function bindFlush(): void {
  if (flushBound || typeof window === "undefined") return;
  flushBound = true;
  attachFlushListeners(queue);
}

function toClipPatch(patch: Partial<Clip>): PatchClipInput {
  const next: PatchClipInput = {};
  if (patch.laneId !== undefined) next.laneId = patch.laneId;
  if (patch.startBeats !== undefined) next.startBeats = patch.startBeats;
  if (patch.lengthBeats !== undefined) next.lengthBeats = patch.lengthBeats;
  if (patch.cueInSec !== undefined) next.cueInSec = patch.cueInSec;
  if (patch.fadeInSec !== undefined) next.fadeInSec = patch.fadeInSec;
  if (patch.fadeOutSec !== undefined) next.fadeOutSec = patch.fadeOutSec;
  if (patch.gainDb !== undefined) next.gainDb = patch.gainDb;
  if (patch.synthPattern !== undefined) next.synthPattern = patch.synthPattern;
  if (patch.label !== undefined) next.label = patch.label;
  return next;
}

function previousClipPatch(clip: Clip, patch: PatchClipInput): PatchClipInput {
  const previous: PatchClipInput = {};
  for (const key of Object.keys(patch) as Array<keyof PatchClipInput>) {
    Object.assign(previous, { [key]: clip[key] });
  }
  return previous;
}

function enqueueClipWrite(id: string): void {
  queue.enqueue({
    id: `clip:${id}`,
    run: async (init) => {
      const clip = useProjectStore.getState().doc?.clips.find((item) => item.id === id);
      const exists = persistedClipIds.has(id);
      if (!clip) {
        if (!exists) {
          clipPatches.delete(id);
          return;
        }
        try {
          await api(`/api/clips/${id}`, { method: "DELETE", ...init });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
        persistedClipIds.delete(id);
        clipPatches.delete(id);
        return;
      }

      if (!exists) {
        const sent = clipPatches.get(id);
        clipPatches.delete(id);
        try {
          await api(`/api/lanes/${clip.laneId}/clips`, {
            method: "POST",
            body: JSON.stringify(clip),
            ...init,
          });
          persistedClipIds.add(id);
        } catch (err) {
          if (sent) restorePatch(clipPatches, id, sent);
          throw err;
        }
        return;
      }

      const merged = clipPatches.get(id);
      if (!merged || Object.keys(merged).length === 0) return;
      clipPatches.delete(id);
      try {
        await api(`/api/clips/${id}`, { method: "PATCH", body: JSON.stringify(merged), ...init });
      } catch (err) {
        restorePatch(clipPatches, id, merged);
        throw err;
      }
    },
  });
}

function rememberPersistedClips(doc: ProjectDocument): void {
  for (const clip of doc.clips) persistedClipIds.add(clip.id);
}

interface ProjectState {
  list: ProjectSummary[];
  doc: ProjectDocument | null;
  loading: boolean;
  error: string | null;
  loadList: () => Promise<void>;
  createProject: (input?: CreateProjectInput) => Promise<Project>;
  loadProject: (id: string) => Promise<void>;
  patchProject: (patch: PatchProjectInput) => void;
  addLane: (input: CreateLaneInput) => Promise<Lane | null>;
  patchLane: (id: string, patch: PatchLaneInput) => void;
  removeLane: (id: string) => void;
  replaceDoc: (doc: ProjectDocument) => void;
  flush: () => Promise<void>;
  assetDuration: (assetId: string | null) => number | null;
  patchClip: (id: string, patch: Partial<Clip>, recordUndo?: boolean) => void;
  addClip: (clip: Clip, recordUndo?: boolean) => void;
  removeClips: (ids: string[], recordUndo?: boolean) => void;
  moveClips: (ids: string[], deltaBeats: number, grid: number, bypassSnap: boolean, recordUndo?: boolean) => void;
  cropClipEdge: (id: string, edge: "start" | "end", beats: number, grid: number, bypassSnap: boolean, recordUndo?: boolean) => void;
  slipClipCue: (id: string, cueInSec: number, recordUndo?: boolean) => void;
  fadeClip: (id: string, fadeInSec: number, fadeOutSec: number, recordUndo?: boolean) => void;
  nudgeSelected: (ids: string[], direction: -1 | 1, grid: number) => void;
  splitAt: (ids: string[], atBeats: number) => void;
  copyClips: (ids: string[]) => Clip[];
  pasteClips: (clips: Clip[], startBeats: number, laneId?: string) => void;
  addSynthPattern: (laneId: string, startBeats: number, lengthBeats?: number) => Clip | null;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  list: [],
  doc: null,
  loading: false,
  error: null,

  loadList: async () => {
    set({ loading: true, error: null });
    try {
      const list = await api<ProjectSummary[]>("/api/projects");
      set({ list, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "load_failed" });
    }
  },

  createProject: async (input = {}) => {
    const project = await api<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
    set((s) => ({
      list: [
        {
          id: project.id,
          title: project.title,
          bpm: project.bpm,
          keySig: project.keySig,
          timeSig: project.timeSig,
          vibe: project.vibe,
          updatedAt: project.updatedAt,
        },
        ...s.list,
      ],
    }));
    return project;
  },

  loadProject: async (id) => {
    bindFlush();
    set({ loading: true, error: null });
    try {
      const doc = await api<ProjectDocument>(`/api/projects/${id}`);
      rememberPersistedClips(doc);
      set({ doc, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "load_failed" });
    }
  },

  patchProject: (patch) => {
    const doc = get().doc;
    if (!doc) return;
    const project: Project = { ...doc.project, ...patch, updatedAt: Date.now() };
    set({ doc: { ...doc, project } });
    projectPatches.set(project.id, { ...projectPatches.get(project.id), ...patch });
    queue.enqueue({
      id: `project:${project.id}`,
      run: async (init) => {
        const merged = projectPatches.get(project.id);
        if (!merged) return;
        projectPatches.delete(project.id);
        try {
          await api(`/api/projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify(merged),
            ...init,
          });
        } catch (err) {
          restorePatch(projectPatches, project.id, merged);
          throw err;
        }
      },
    });
  },

  addLane: async (input) => {
    const doc = get().doc;
    if (!doc) return null;
    const t = Date.now();
    const optimistic: Lane = {
      id: newId(),
      projectId: doc.project.id,
      kind: input.kind,
      name: input.name?.trim() || LANE_KIND_NAMES[input.kind],
      sortOrder: doc.lanes.length,
      muted: false,
      soloed: false,
      volumeDb: 0,
      pan: 0,
      armed: input.arm ?? (input.kind === "music3" || input.kind === "acestep"),
      visible: true,
      parentLaneId: null,
      stemRole: null,
      synthConfig: input.kind === "synth" ? JSON.stringify(defaultSynthConfig()) : null,
      createdAt: t,
      updatedAt: t,
    };
    const lanes = optimistic.armed
      ? [...doc.lanes.map((l) => ({ ...l, armed: false })), optimistic]
      : [...doc.lanes, optimistic];
    set({ doc: { ...doc, lanes } });
    try {
      const created = await api<Lane>(`/api/projects/${doc.project.id}/lanes`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      set((s) => {
        if (!s.doc) return s;
        return {
          doc: {
            ...s.doc,
            lanes: s.doc.lanes.map((l) => (l.id === optimistic.id ? created : l)),
          },
        };
      });
      return created;
    } catch (err) {
      set((s) => {
        if (!s.doc) return s;
        return { doc: { ...s.doc, lanes: s.doc.lanes.filter((l) => l.id !== optimistic.id) } };
      });
      console.error(err);
      return null;
    }
  },

  patchLane: (id, patch) => {
    const doc = get().doc;
    if (!doc) return;
    const lanes = doc.lanes.map((l) => {
      if (patch.armed && l.id !== id) return { ...l, armed: false };
      if (l.id !== id) return l;
      return { ...l, ...patch, updatedAt: Date.now() };
    });
    set({ doc: { ...doc, lanes } });
    lanePatches.set(id, { ...lanePatches.get(id), ...patch });
    queue.enqueue({
      id: `lane:${id}`,
      run: async (init) => {
        const merged = lanePatches.get(id);
        if (!merged) return;
        lanePatches.delete(id);
        try {
          await api(`/api/lanes/${id}`, {
            method: "PATCH",
            body: JSON.stringify(merged),
            ...init,
          });
        } catch (err) {
          restorePatch(lanePatches, id, merged);
          throw err;
        }
      },
    });
  },

  removeLane: (id) => {
    const doc = get().doc;
    if (!doc) return;
    set({
      doc: {
        ...doc,
        lanes: doc.lanes.filter((l) => l.id !== id),
        clips: doc.clips.filter((c) => c.laneId !== id),
      },
    });
    queue.enqueue({
      id: `lane-del:${id}`,
      run: async (init) => {
        await api(`/api/lanes/${id}`, { method: "DELETE", ...init });
      },
    });
  },

  replaceDoc: (doc) => {
    rememberPersistedClips(doc);
    set({ doc });
  },
  flush: () => queue.flush(),

  assetDuration: (assetId) => {
    if (!assetId) return null;
    return get().doc?.assets.find((asset) => asset.id === assetId)?.durationSec ?? null;
  },

  patchClip: (id, patch, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    const prev = doc.clips.find((clip) => clip.id === id);
    if (!prev) return;
    const persistedPatch = toClipPatch(patch);
    const next = { ...prev, ...persistedPatch, updatedAt: Date.now() };
    set({ doc: { ...doc, clips: doc.clips.map((clip) => (clip.id === id ? next : clip)) } });
    toneEngine.invalidateSchedule();
    clipPatches.set(id, { ...clipPatches.get(id), ...persistedPatch });
    enqueueClipWrite(id);
    if (recordUndo) {
      const previous = previousClipPatch(prev, persistedPatch);
      undoStack.push({
        label: "edit clip",
        undo: () => get().patchClip(id, previous, false),
        redo: () => get().patchClip(id, persistedPatch, false),
      });
    }
  },

  addClip: (clip, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    set({ doc: { ...doc, clips: [...doc.clips, clip] } });
    toneEngine.invalidateSchedule();
    enqueueClipWrite(clip.id);
    if (recordUndo) {
      undoStack.push({
        label: "add clip",
        undo: () => get().removeClips([clip.id], false),
        redo: () => get().addClip(clip, false),
      });
    }
  },

  removeClips: (ids, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    const removed = doc.clips.filter((clip) => ids.includes(clip.id));
    if (removed.length === 0) return;
    set({ doc: { ...doc, clips: doc.clips.filter((clip) => !ids.includes(clip.id)) } });
    toneEngine.invalidateSchedule();
    for (const id of ids) enqueueClipWrite(id);
    if (recordUndo) {
      undoStack.push({
        label: "delete clips",
        undo: () => {
          for (const clip of removed) get().addClip(clip, false);
        },
        redo: () => get().removeClips(ids, false),
      });
    }
  },

  moveClips: (ids, deltaBeats, grid, bypassSnap, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    const before = doc.clips.filter((clip) => ids.includes(clip.id));
    const after = before.map((clip) => moveClip(clip, clip.startBeats + deltaBeats, grid, bypassSnap));
    set({
      doc: {
        ...doc,
        clips: doc.clips.map((clip) => after.find((item) => item.id === clip.id) ?? clip),
      },
    });
    toneEngine.invalidateSchedule();
    for (const clip of after) {
      clipPatches.set(clip.id, { ...clipPatches.get(clip.id), startBeats: clip.startBeats });
      enqueueClipWrite(clip.id);
    }
    if (recordUndo) {
      undoStack.push({
        label: "move",
        undo: () => {
          for (const clip of before) get().patchClip(clip.id, { startBeats: clip.startBeats }, false);
        },
        redo: () => {
          for (const clip of after) get().patchClip(clip.id, { startBeats: clip.startBeats }, false);
        },
      });
    }
  },

  cropClipEdge: (id, edge, beats, grid, bypassSnap, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    const clip = doc.clips.find((item) => item.id === id);
    if (!clip) return;
    const next = cropClip(clip, edge, beats, doc.project.bpm, get().assetDuration(clip.assetId), grid, bypassSnap);
    get().patchClip(id, {
      startBeats: next.startBeats,
      lengthBeats: next.lengthBeats,
      cueInSec: next.cueInSec,
    }, recordUndo);
  },

  slipClipCue: (id, cueInSec, recordUndo = true) => {
    const doc = get().doc;
    if (!doc) return;
    const clip = doc.clips.find((item) => item.id === id);
    if (!clip) return;
    const next = slipClip(clip, cueInSec, doc.project.bpm, get().assetDuration(clip.assetId));
    get().patchClip(id, { cueInSec: next.cueInSec }, recordUndo);
  },

  fadeClip: (id, fadeInSec, fadeOutSec, recordUndo = true) => {
    const clip = get().doc?.clips.find((item) => item.id === id);
    if (!clip) return;
    const next = setFades(clip, fadeInSec, fadeOutSec);
    get().patchClip(id, { fadeInSec: next.fadeInSec, fadeOutSec: next.fadeOutSec }, recordUndo);
  },

  nudgeSelected: (ids, direction, grid) => {
    const doc = get().doc;
    if (!doc) return;
    for (const id of ids) {
      const clip = doc.clips.find((item) => item.id === id);
      if (!clip) continue;
      const next = nudgeClip(clip, direction, grid);
      get().patchClip(id, { startBeats: next.startBeats });
    }
  },

  splitAt: (ids, atBeats) => {
    const doc = get().doc;
    if (!doc) return;
    for (const id of ids) {
      const clip = get().doc?.clips.find((item) => item.id === id);
      if (!clip) continue;
      const split = splitClip(clip, atBeats, doc.project.bpm, newId());
      if (!split) continue;
      const [left, right] = split;
      get().patchClip(id, { lengthBeats: left.lengthBeats }, false);
      get().addClip(right, false);
      undoStack.push({
        label: "split",
        undo: () => {
          get().removeClips([right.id], false);
          get().patchClip(id, { lengthBeats: clip.lengthBeats }, false);
        },
        redo: () => {
          get().patchClip(id, { lengthBeats: left.lengthBeats }, false);
          get().addClip(right, false);
        },
      });
    }
  },

  copyClips: (ids) => {
    const doc = get().doc;
    if (!doc) return [];
    return doc.clips.filter((clip) => ids.includes(clip.id));
  },

  pasteClips: (clips, startBeats, laneId) => {
    if (clips.length === 0) return;
    const origin = Math.min(...clips.map((clip) => clip.startBeats));
    for (const clip of clips) {
      const next = copyClip(clip, newId(), startBeats + (clip.startBeats - origin));
      if (laneId) next.laneId = laneId;
      get().addClip(next);
    }
  },

  addSynthPattern: (laneId, startBeats, lengthBeats = 16) => {
    const doc = get().doc;
    if (!doc) return null;
    const t = Date.now();
    const clip: Clip = {
      id: newId(),
      laneId,
      assetId: null,
      startBeats,
      lengthBeats,
      cueInSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      gainDb: 0,
      synthPattern: stringifySynthPattern([]),
      label: "pattern",
      createdAt: t,
      updatedAt: t,
    };
    get().addClip(clip);
    return clip;
  },
}));
