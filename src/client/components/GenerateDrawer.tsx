import { useMemo, useState } from "react";
import { draftCaptionFromProject } from "@shared/caption";
import { SECTION_TAGS } from "@shared/types";
import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";
import { JobChip } from "./JobChip";

export function GenerateDrawer() {
  const drawer = useUiStore((s) => s.drawer);
  const close = useUiStore((s) => s.closeDrawer);
  const doc = useProjectStore((s) => s.doc);
  const jobs = useJobStore((s) => s.jobs);
  const submit = useJobStore((s) => s.submit);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);

  const [lyrics, setLyrics] = useState("[Verse]\n");
  const [caption, setCaption] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [durationSec, setDurationSec] = useState(60);
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
    if (!armed || armed.kind !== "music3") {
      setError("Arm a Music3 lane first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[420px] flex-col border-l border-line bg-panel p-5 shadow-2xl">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Generate</h2>
        <button type="button" className="font-mono text-xs text-mute" onClick={close}>
          close
        </button>
      </div>
      <p className="mb-3 text-sm text-mute">
        Music3 writes the whole band. Want parts? Explode into stems (M7). Target:{" "}
        <span className="text-brass">{armed?.name ?? "no armed lane"}</span>
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {SECTION_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute hover:border-brass hover:text-brass"
            onClick={() => insertTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <label className="mb-3 block text-xs uppercase tracking-widest text-mute">
        Lyrics
        <textarea
          className="mt-1 h-36 w-full p-2 font-mono text-sm"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
        />
      </label>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-mute">Caption</span>
        <button
          type="button"
          className="font-mono text-[10px] text-brass hover:underline"
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
        className="mb-3 h-40 w-full p-2 font-mono text-xs"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <div className="mb-4 flex gap-3">
        <label className="flex-1 text-xs uppercase tracking-widest text-mute">
          Seed
          <div className="mt-1 flex gap-1">
            <input
              type="number"
              className="w-full px-2 py-1 font-mono"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className="border border-line px-2 text-brass"
              onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
            >
              ⚄
            </button>
          </div>
        </label>
        <label className="flex-1 text-xs uppercase tracking-widest text-mute">
          Duration (10–240)
          <input
            type="number"
            min={10}
            max={240}
            className="mt-1 w-full px-2 py-1 font-mono"
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value) || 60)}
          />
        </label>
      </div>
      {error && <p className="mb-2 font-mono text-xs text-ember">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onSubmit()}
        className="rounded-sm bg-brass py-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit to GPU"}
      </button>
      <div className="mt-4 space-y-2">
        {mine.map((job) => (
          <JobChip key={job.id} job={job} />
        ))}
      </div>
    </aside>
  );
}
