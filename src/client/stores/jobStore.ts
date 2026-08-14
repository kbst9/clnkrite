import { create } from "zustand";
import type { CreateJobInput, Job } from "@shared/types";
import { isTerminalJobStatus } from "@shared/jobs";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "./uiStore";
import { useProjectStore } from "./projectStore";

interface JobState {
  jobs: Record<string, Job>;
  polling: boolean;
  submit: (projectId: string, input: CreateJobInput) => Promise<Job>;
  cancel: (id: string) => Promise<void>;
  hydrate: (jobs: Job[]) => void;
  pollOnce: (id: string) => Promise<Job | null>;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
const inFlightPolls = new Map<string, Promise<Job | null>>();

function ensurePoll(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const { jobs } = useJobStore.getState();
    const active = Object.values(jobs).filter((j) => !isTerminalJobStatus(j.status));
    if (active.length === 0) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      useJobStore.setState({ polling: false });
      return;
    }
    for (const job of active) {
      void useJobStore.getState().pollOnce(job.id);
    }
  }, 2000);
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: {},
  polling: false,

  hydrate: (jobs) => {
    const map: Record<string, Job> = { ...get().jobs };
    for (const job of jobs) map[job.id] = job;
    set({ jobs: map });
    if (jobs.some((j) => !isTerminalJobStatus(j.status))) {
      set({ polling: true });
      ensurePoll();
    }
  },

  submit: async (projectId, input) => {
    const job = await api<Job>(`/api/projects/${projectId}/jobs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    set((s) => ({ jobs: { ...s.jobs, [job.id]: job }, polling: !isTerminalJobStatus(job.status) }));
    if (!isTerminalJobStatus(job.status)) ensurePoll();
    return job;
  },

  cancel: async (id) => {
    const job = await api<Job>(`/api/jobs/${id}/cancel`, { method: "POST" });
    set((s) => ({ jobs: { ...s.jobs, [id]: job } }));
  },

  pollOnce: async (id) => {
    const existing = inFlightPolls.get(id);
    if (existing) return existing;

    const poll = (async () => {
      try {
        const job = await api<Job>(`/api/jobs/${id}`);
        set((s) => ({ jobs: { ...s.jobs, [id]: job } }));
        if (job.status === "succeeded") {
          const projectId = useProjectStore.getState().doc?.project.id;
          if (projectId) void useProjectStore.getState().loadProject(projectId);
        }
        return job;
      } catch (err) {
        if (err instanceof ApiError && (err.code === "bridge_offline" || err.status === 503)) {
          useUiStore.getState().setBridge(false, "bridge_offline");
        }
        return null;
      } finally {
        inFlightPolls.delete(id);
      }
    })();
    inFlightPolls.set(id, poll);
    return poll;
  },
}));
