import { formatElapsed, isTerminalJobStatus, jobKindLabel, jobStateLabel } from "@shared/jobs";
import type { Job } from "@shared/types";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

function stateClass(status: Job["status"]): string {
  if (status === "failed" || status === "cancelled") return "text-alert";
  if (status === "succeeded") return "text-ok";
  if (status === "queued" || status === "ingesting") return "text-warn";
  return "text-fg";
}

function utcTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function JobsPanel() {
  const drawer = useUiStore((s) => s.drawer);
  const close = useUiStore((s) => s.closeDrawer);
  const paramsId = useUiStore((s) => s.jobParamsId);
  const setParamsId = useUiStore((s) => s.setJobParamsId);
  const jobs = useJobStore((s) => s.jobs);
  const cancel = useJobStore((s) => s.cancel);
  const submit = useJobStore((s) => s.submit);
  const doc = useProjectStore((s) => s.doc);
  const now = Date.now();

  if (drawer !== "jobs") return null;

  const rows = Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt);
  const selected = rows.find((job) => job.id === paramsId);

  async function regenerate(job: Job) {
    if (!doc) return;
    const armed = doc.lanes.find((lane) => lane.armed);
    if (job.kind === "demucs_split") {
      await submit(doc.project.id, { kind: job.kind, laneId: job.laneId ?? undefined, params: job.params });
      return;
    }
    if (!armed) return;
    await submit(doc.project.id, { kind: job.kind, laneId: armed.id, params: job.params });
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[480px] flex-col border-l border-line bg-bg1">
      <div className="flex h-8 items-center justify-between border-b border-line px-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">JOBS</h2>
        <button type="button" className="ctrl h-6 px-2" onClick={close}>
          ESC ×
        </button>
      </div>
      <div className="grid grid-cols-[72px_72px_72px_36px_56px_1fr] gap-x-2 border-b border-line px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        <span>TIME</span>
        <span>KIND</span>
        <span>STATE</span>
        <span>POS</span>
        <span>ELAPSED</span>
        <span>ACTION</span>
      </div>
      <ul className="flex-1 overflow-auto">
        {rows.length === 0 && (
          <li className="px-3 py-3 text-[12px] text-fg-faint">NO JOBS.</li>
        )}
        {rows.map((job) => (
          <li
            key={job.id}
            className="grid grid-cols-[72px_72px_72px_36px_56px_1fr] items-center gap-x-2 border-b border-line px-3 py-1.5 text-[12px] leading-4"
          >
            <span className="text-fg-dim">{utcTime(job.createdAt)}</span>
            <span>{jobKindLabel(job.kind)}</span>
            <span className={stateClass(job.status)}>{jobStateLabel(job.status)}</span>
            <span className="text-fg-dim">{job.queuePosition ?? "—"}</span>
            <span className="text-fg-dim">{formatElapsed(now - job.createdAt)}</span>
            <span className="flex gap-2">
              {!isTerminalJobStatus(job.status) && (
                <button type="button" className="text-alert uppercase" onClick={() => void cancel(job.id)}>
                  {job.status === "queued" ? "DROP" : "ABORT"}
                </button>
              )}
              <button type="button" className="text-fg-dim uppercase" onClick={() => setParamsId(job.id)}>
                PARAMS
              </button>
            </span>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="border-t border-line px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            PARAMS · {jobKindLabel(selected.kind)}
            <button type="button" className="ctrl-accent h-6 px-2" onClick={() => void regenerate(selected)}>
              REGENERATE
            </button>
          </div>
          <pre className="max-h-40 overflow-auto bg-bg2 p-2 text-[11px] text-fg-dim">
            {JSON.stringify(selected.params, null, 2)}
          </pre>
        </div>
      )}
    </aside>
  );
}
