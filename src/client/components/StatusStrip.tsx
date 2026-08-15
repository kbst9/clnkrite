import { useEffect, useState } from "react";
import { formatElapsed, isTerminalJobStatus, jobKindLabel, jobStateLabel } from "@shared/jobs";
import { getWriteQueue } from "../stores/projectStore";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

function Square({ tone }: { tone: "ok" | "warn" | "alert" | "idle" }) {
  const fill =
    tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "alert" ? "bg-alert" : "bg-idle";
  return <span className={`sq ${fill}`} />;
}

function Seg({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 border-r border-line px-2.5 py-0 last:border-r-0">{children}</span>
  );
}

export function StatusStrip({ showProject = true }: { showProject?: boolean }) {
  const title = useProjectStore((s) => s.doc?.project.title);
  const jobs = useJobStore((s) => s.jobs);
  const bridgeOnline = useUiStore((s) => s.bridgeOnline);
  const music3Up = useUiStore((s) => s.music3Up);
  const music3Model = useUiStore((s) => s.music3Model);
  const acestepPresent = useUiStore((s) => s.acestepPresent);
  const demucsAvailable = useUiStore((s) => s.demucsAvailable);
  const queueDepth = useUiStore((s) => s.queueDepth);
  const queueRunning = useUiStore((s) => s.queueRunning);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(() => getWriteQueue().pending);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const unsub = getWriteQueue().subscribe(() => setPending(getWriteQueue().pending));
    return () => {
      window.clearInterval(tick);
      unsub();
    };
  }, []);

  const active = Object.values(jobs).find((job) => !isTerminalJobStatus(job.status));
  const utc = new Date(now).toISOString().slice(11, 19);

  return (
    <div className="flex h-7 items-center overflow-hidden border-b border-line bg-bg1 font-mono text-[10px] font-medium uppercase leading-[14px] tracking-[0.08em] text-fg-dim">
      <Seg>
        <span className="text-fg">CLNKRITE</span>
        {showProject && title ? <span className="text-fg-faint">· {title}</span> : null}
      </Seg>
      <Seg>
        <span>BRIDGE</span>
        <Square tone={bridgeOnline === true ? "ok" : bridgeOnline === false ? "alert" : "idle"} />
        <span className={bridgeOnline === false ? "text-alert" : "text-fg"}>
          {bridgeOnline === true ? "ONLINE" : bridgeOnline === false ? "OFFLINE" : "…"}
        </span>
      </Seg>
      <Seg>
        <span>MUSIC3</span>
        <Square tone={music3Up ? "ok" : "idle"} />
        <span className="truncate text-fg">{music3Up ? (music3Model ?? "UP") : "—"}</span>
      </Seg>
      <Seg>
        <span>ACE-STEP</span>
        <Square tone={acestepPresent ? "ok" : "idle"} />
        <span>{acestepPresent ? "RDY" : "—"}</span>
      </Seg>
      <Seg>
        <span>DEMUCS</span>
        <Square tone={demucsAvailable ? "ok" : "idle"} />
        <span>{demucsAvailable ? "RDY" : "—"}</span>
      </Seg>
      <Seg>
        <span>QUEUE</span>
        <span className="text-fg">
          {queueDepth}/{queueRunning ? "RUNNING" : "IDLE"}
        </span>
      </Seg>
      <button type="button" className="flex items-center" onClick={() => openDrawer("jobs")}>
        <Seg>
          <span>JOB</span>
          {active ? (
            <>
              <Square
                tone={
                  active.status === "failed"
                    ? "alert"
                    : active.status === "ingesting" || active.status === "queued"
                      ? "warn"
                      : "ok"
                }
              />
              <span className="text-fg">
                {jobKindLabel(active.kind)} {jobStateLabel(active.status)} {formatElapsed(now - active.createdAt)}
                {active.queuePosition != null && active.status === "queued" ? ` P${active.queuePosition}` : ""}
              </span>
            </>
          ) : (
            <span>—</span>
          )}
        </Seg>
      </button>
      <Seg>
        <span>SAVE</span>
        <Square tone={pending > 0 ? "warn" : "ok"} />
        <span className="text-fg">{pending > 0 ? `SYNCING ${pending}` : "SAVED"}</span>
      </Seg>
      <span className="ml-auto px-2.5 text-fg-faint">{utc} UTC</span>
    </div>
  );
}
