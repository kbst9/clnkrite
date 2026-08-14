import type { ReactNode } from "react";
import { isTerminalJobStatus } from "@shared/jobs";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";
import { JobChip } from "./JobChip";
import { Transport } from "./Transport";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-mute">{label}</span>
      {children}
    </label>
  );
}

export function TopBar() {
  const project = useProjectStore((s) => s.doc?.project);
  const patchProject = useProjectStore((s) => s.patchProject);
  const jobs = useJobStore((s) => s.jobs);
  const bridgeOnline = useUiStore((s) => s.bridgeOnline);
  const openDrawer = useUiStore((s) => s.openDrawer);

  if (!project) return null;
  const active = Object.values(jobs).filter((j) => !isTerminalJobStatus(j.status));

  return (
    <header className="flex flex-wrap items-end gap-4 border-b border-line bg-panel/90 px-4 py-3 backdrop-blur">
      <button
        type="button"
        className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute hover:text-paper"
        onClick={() => {
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      >
        ← desk
      </button>
      <Field label="Title">
        <input
          className="w-44 border-0 border-b border-line bg-transparent px-0 py-0.5 text-lg font-semibold"
          value={project.title}
          onChange={(e) => patchProject({ title: e.target.value })}
        />
      </Field>
      <Field label="BPM">
        <input
          type="number"
          className="w-16 bg-ink px-2 py-1 font-mono text-sm"
          value={project.bpm}
          onChange={(e) => patchProject({ bpm: Number(e.target.value) || 120 })}
        />
      </Field>
      <Field label="Key">
        <input
          className="w-24 bg-ink px-2 py-1 font-mono text-sm"
          value={project.keySig}
          onChange={(e) => patchProject({ keySig: e.target.value })}
        />
      </Field>
      <Field label="Time">
        <input
          className="w-16 bg-ink px-2 py-1 font-mono text-sm"
          value={project.timeSig}
          onChange={(e) => patchProject({ timeSig: e.target.value || "4/4" })}
        />
      </Field>
      <Field label="Vibe">
        <input
          className="w-40 bg-ink px-2 py-1 text-sm"
          value={project.vibe}
          placeholder="late neon, wet streets"
          onChange={(e) => patchProject({ vibe: e.target.value })}
        />
      </Field>
      <Field label="Length">
        <input
          type="number"
          className="w-16 bg-ink px-2 py-1 font-mono text-sm"
          value={project.lengthBeats}
          onChange={(e) => patchProject({ lengthBeats: Number(e.target.value) || 128 })}
        />
      </Field>
      <Field label="Loop">
        <div className="flex gap-1">
          <input
            type="number"
            className="w-14 bg-ink px-1 py-1 font-mono text-xs"
            value={project.loopStartBeats ?? ""}
            placeholder="in"
            onChange={(e) =>
              patchProject({ loopStartBeats: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <input
            type="number"
            className="w-14 bg-ink px-1 py-1 font-mono text-xs"
            value={project.loopEndBeats ?? ""}
            placeholder="out"
            onChange={(e) =>
              patchProject({ loopEndBeats: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
      </Field>
      <Transport />
      <div className="ml-auto flex items-center gap-3">
        {active.map((job) => (
          <JobChip key={job.id} job={job} />
        ))}
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-mute">
          <span
            className={`h-2 w-2 rounded-full ${
              bridgeOnline === true ? "bg-phosphor" : bridgeOnline === false ? "bg-ember" : "bg-mute"
            }`}
          />
          {bridgeOnline === false ? "GPU bridge offline" : "bridge"}
        </span>
        <button
          type="button"
          className="rounded-sm border border-brass/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brass hover:bg-brass hover:text-ink"
          onClick={() => openDrawer("generate")}
        >
          Generate
        </button>
      </div>
    </header>
  );
}
