import { useRef, useState } from "react";
import type { LaneKind } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

const SOURCES: Array<{ kind: LaneKind; title: string; blurb: string }> = [
  { kind: "music3", title: "Music3", blurb: "Full-mix generate on Kevin's GPU. Writes the whole band." },
  { kind: "acestep", title: "ACE-Step", blurb: "Second local engine. Hidden unless the bridge reports it." },
  { kind: "synth", title: "Synth", blurb: "Tone.js instrument lane. Pattern editor ships in M5." },
  { kind: "import", title: "Import", blurb: "Drop a vocal or stem. wav / mp3 / flac / m4a / ogg." },
];

export function AddLaneDrawer() {
  const drawer = useUiStore((s) => s.drawer);
  const close = useUiStore((s) => s.closeDrawer);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const music3Up = useUiStore((s) => s.music3Up);
  const acestepPresent = useUiStore((s) => s.acestepPresent);
  const bridgeOnline = useUiStore((s) => s.bridgeOnline);
  const addLane = useProjectStore((s) => s.addLane);
  const projectId = useProjectStore((s) => s.doc?.project.id);
  const importLane = useProjectStore((s) => s.doc?.lanes.find((lane) => lane.kind === "import"));
  const loadProject = useProjectStore((s) => s.loadProject);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (drawer !== "add-lane") return null;

  async function add(kind: LaneKind) {
    const lane = await addLane({ kind });
    close();
    if (lane && (kind === "music3" || kind === "acestep")) openDrawer("generate");
  }

  async function onImport(file: File) {
    if (!projectId) return;
    setError(null);
    setUploading(true);
    try {
      const lane = importLane ?? (await addLane({ kind: "import" }));
      if (!lane) throw new Error("Could not create the import lane");

      const form = new FormData();
      form.append("file", file);
      form.append("laneId", lane.id);
      form.append("startBeats", String(playheadBeats));
      const response = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Upload failed (${response.status})`);
      }
      await loadProject(projectId);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 w-[380px] border-l border-line bg-panel p-5 shadow-2xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Add a lane</h2>
        <button type="button" className="font-mono text-xs text-mute" onClick={close}>
          close
        </button>
      </div>
      <ul className="space-y-3">
        {SOURCES.map((src) => {
          const blocked =
            (src.kind === "music3" && (bridgeOnline === false || !music3Up)) ||
            (src.kind === "acestep" && !acestepPresent);
          const reason =
            src.kind === "music3" && bridgeOnline === false
              ? "GPU bridge offline"
              : src.kind === "music3" && !music3Up
                ? "Music3 not reported up"
                : src.kind === "acestep"
                  ? "ACE-Step not present"
                  : "";
          return (
            <li key={src.kind}>
              <button
                type="button"
                disabled={blocked || uploading}
                onClick={() => {
                  if (src.kind === "import") fileInput.current?.click();
                  else void add(src.kind);
                }}
                className="w-full rounded-md border border-line bg-rail px-4 py-3 text-left hover:border-brass/50 disabled:opacity-40"
              >
                <div className="font-semibold">{src.title}</div>
                <div className="text-sm text-mute">{blocked ? reason : src.blurb}</div>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mt-6 block rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-mute hover:border-brass">
        {uploading ? "Importing…" : "Import audio file"}
        <input
          ref={fileInput}
          type="file"
          disabled={uploading}
          accept="audio/wav,audio/mpeg,audio/flac,audio/ogg,audio/mp4,audio/x-m4a,.wav,.mp3,.flac,.ogg,.m4a"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
      </label>
      {error && <p className="mt-3 font-mono text-xs text-ember">{error}</p>}
    </aside>
  );
}
