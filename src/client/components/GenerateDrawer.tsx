import { useMemo, useState } from "react";
import { draftCaptionFromProject } from "@shared/caption";
import { formatElapsed, jobKindLabel, jobStateLabel } from "@shared/jobs";
import { SECTION_TAGS } from "@shared/types";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

export function GenerateDrawer() {
  const drawer = useUiStore((s) => s.drawer);
  const close = useUiStore((s) => s.closeDrawer);
  const doc = useProjectStore((s) => s.doc);
  const patchProject = useProjectStore((s) => s.patchProject);
  const jobs = useJobStore((s) => s.jobs);
  const submit = useJobStore((s) => s.submit);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);

  const [lyrics, setLyrics] = useState("[Verse]\n");
  const [caption, setCaption] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [durationSec, setDurationSec] = useState(60);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = doc?.lanes.find((l) => l.armed);
  const mine = useMemo(
    () => Object.values(jobs).filter((j) => j.projectId === doc?.project.id),
    [jobs, doc?.project.id],
  );

  if (drawer !== "generate" || !doc) return null;

  function insertTag(tag: string) {
    setLyrics((prev) => (prev.endsWith("\n") || prev.length === 0 ? `${prev}${tag}\n` : `${prev}\n${tag}\n`));
  }

  async function onSubmit() {
    if (!armed || (armed.kind !== "music3" && armed.kind !== "acestep")) {
      setError("Arm a Music3 or ACE-Step lane first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (armed.kind === "acestep") {
        await submit(doc!.project.id, {
          kind: "acestep_generate",
          laneId: armed.id,
          params: {
            prompt: caption,
            lyrics,
            audioDuration: Math.min(600, Math.max(10, durationSec)),
            bpm: doc!.project.bpm,
            seed,
            inferenceSteps,
            playheadBeats,
          },
        });
      } else {
        await submit(doc!.project.id, {
          kind: "music3_generate",
          laneId: armed.id,
          params: {
            lyrics,
            caption,
            seed,
            durationSec: Math.min(240, Math.max(10, durationSec)),
            playheadBeats,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[420px] flex-col border-l border-line bg-bg1">
      <div className="flex h-8 items-center justify-between border-b border-line px-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">GENERATE</h2>
        <button type="button" className="ctrl h-6 px-2" onClick={close}>
          ESC ×
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-3">
        <p className="mb-3 font-sans text-[12px] text-fg-dim">
          Music3 writes the whole band. Want parts? Right-click a clip and explode into stems. Target:{" "}
          <span className="text-accent">{armed?.name ?? "no armed lane"}</span>
        </p>
        <label className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-fg-faint">
          VIBE
          <input
            className="h-7 flex-1 px-2 text-[12px] normal-case tracking-normal text-fg"
            value={doc.project.vibe}
            onChange={(e) => patchProject({ vibe: e.target.value })}
          />
        </label>
        <div className="mb-2 flex flex-wrap gap-1">
          {SECTION_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="h-5 border border-line px-1.5 text-[10px] text-fg-dim hover:border-line-strong hover:text-fg"
              onClick={() => insertTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <label className="mb-3 block text-[10px] uppercase tracking-[0.08em] text-fg-faint">
          Lyrics
          <textarea
            className="mt-1 h-36 w-full bg-bg2 p-2 font-mono text-[12px] leading-4"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
        </label>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">Caption</span>
          <button
            type="button"
            className="text-[10px] uppercase text-accent"
            onClick={() =>
              setCaption(
                draftCaptionFromProject({
                  bpm: doc.project.bpm,
                  keySig: doc.project.keySig,
                  timeSig: doc.project.timeSig,
                  vibe: doc.project.vibe,
                }),
              )
            }
          >
            Draft from project
          </button>
        </div>
        <textarea
          className="mb-3 h-40 w-full bg-bg2 p-2 font-mono text-[12px] leading-4"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className="mb-4 flex gap-3">
          <label className="flex-1 text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Seed
            <div className="mt-1 flex gap-1">
              <input
                type="number"
                className="h-7 w-full px-2 font-mono text-[12px]"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
              />
              <button
                type="button"
                className="ctrl h-7 px-2"
                onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
              >
                ⚄
              </button>
            </div>
          </label>
          <label className="flex-1 text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Duration
            <input
              type="number"
              min={10}
              max={armed?.kind === "acestep" ? 600 : 240}
              className="mt-1 h-7 w-full px-2 font-mono text-[12px]"
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value) || 60)}
            />
          </label>
        </div>
        {armed?.kind === "acestep" && (
          <label className="mb-3 block text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Inference steps
            <input
              type="number"
              min={1}
              max={64}
              className="mt-1 h-7 w-full px-2 font-mono text-[12px]"
              value={inferenceSteps}
              onChange={(e) => setInferenceSteps(Number(e.target.value) || 8)}
            />
          </label>
        )}
        {error && <p className="mb-2 text-[12px] text-alert">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void onSubmit()} className="ctrl-accent w-full">
          {busy ? "SUBMITTING…" : "SUBMIT TO GPU"}
        </button>
        <div className="mt-4 space-y-1">
          {mine.map((job) => (
            <div key={job.id} className="flex justify-between border border-line px-2 py-1 text-[12px]">
              <span>
                {jobKindLabel(job.kind)} <span className="text-fg-dim">{jobStateLabel(job.status)}</span>
              </span>
              <span className="text-fg-faint">{formatElapsed(Date.now() - job.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
