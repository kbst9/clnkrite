import { create } from "zustand";
import { newId } from "@shared/ids";
import type {
  CreateLaneInput,
  CreateProjectInput,
  Lane,
  PatchLaneInput,
  PatchProjectInput,
  Project,
  ProjectDocument,
  ProjectSummary,
} from "@shared/types";
import { LANE_KIND_NAMES } from "@shared/types";
import { api } from "../lib/api";
import { attachFlushListeners, WriteQueue } from "../lib/writeQueue";

const queue = new WriteQueue(500);
const projectPatches = new Map<string, PatchProjectInput>();
const lanePatches = new Map<string, PatchLaneInput>();
let flushBound = false;

function restorePatch<T extends object>(pending: Map<string, T>, id: string, sent: T): void {
  pending.set(id, { ...sent, ...pending.get(id) });
}

function bindFlush(): void {
  if (flushBound || typeof window === "undefined") return;
  flushBound = true;
  attachFlushListeners(queue);
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
      synthConfig: null,
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

  replaceDoc: (doc) => set({ doc }),
  flush: () => queue.flush(),
}));
