import type { Job } from "@shared/types";
import { useJobStore } from "../stores/jobStore";

export function JobChip({ job }: { job: Job }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-rail px-3 py-1 font-mono text-[11px] tracking-wide">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          job.status === "failed"
            ? "bg-ember"
            : job.status === "succeeded"
              ? "bg-phosphor"
              : "bg-brass animate-pulse"
        }`}
      />
      <span className="uppercase text-mute">{job.kind.replace("_", " ")}</span>
      <span className="text-paper">{job.status}</span>
      {!["succeeded", "failed", "cancelled"].includes(job.status) && (
        <button
          type="button"
          className="text-ember hover:underline"
          onClick={() => void useJobStore.getState().cancel(job.id)}
        >
          cancel
        </button>
      )}
    </div>
  );
}
