import { useRef, useState } from "react";
import type { LaneKind } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

const SOURCES: Array<{ kind: LaneKind; title: string; blurb: string }> = [
  { kind: "music3", title: "MUSIC3", blurb: "Full-mix generate on the local GPU." },
  { kind: "acestep", title: "ACE-STEP", blurb: "Second local engine. Hidden unless present." },
  { kind: "synth", title: "SYNTH", blurb: "Tone.js. Double-click the lane to drop a pattern." },
  { kind: "import", title: "IMPORT", blurb: "Vocal or stem. wav / mp3 / flac / m4a / ogg." },
  { kind: "picture", title: "PICTURE", blurb: "One video lane, locked to transport." },
];

const STRIPE: Record<LaneKind, string> = {
  music3: "bg-lane-music3",
  acestep: "bg-lane-acestep",
  synth: "bg-lane-synth",
  import: "bg-lane-import",
  picture: "bg-lane-picture",
};

function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const finish = (duration?: number) => {
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      if (duration != null && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("Could not read media duration"));
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish();
    media.src = url;
  });
}

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
  const addSynthPattern = useProjectStore((s) => s.addSynthPattern);
  const loadProject = useProjectStore((s) => s.loadProject);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (drawer !== "add-lane") return null;

  async function add(kind: LaneKind) {
    if (kind === "picture") {
      fileInput.current?.click();
      return;
    }
    const lane = await addLane({ kind });
    close();
    if (lane && (kind === "music3" || kind === "acestep")) openDrawer("generate");
    if (lane && kind === "synth") addSynthPattern(lane.id, playheadBeats, 16);
  }

  async function onImport(file: File) {
    if (!projectId) return;
    setError(null);
    setUploading(true);
    try {
      const isVideo = file.type.startsWith("video/");
      const durationSec = await readMediaDuration(file).catch(() => null);
      const lane = isVideo
        ? await addLane({ kind: "picture" })
        : importLane ?? (await addLane({ kind: "import" }));
      if (!lane) throw new Error("Could not create the import lane");

      const form = new FormData();
      form.append("file", file);
      form.append("laneId", lane.id);
      form.append("startBeats", String(playheadBeats));
      if (durationSec != null) form.append("durationSec", String(durationSec));
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
    <aside className="absolute inset-y-0 right-0 z-20 w-[380px] border-l border-line bg-bg1">
      <div className="flex h-8 items-center justify-between border-b border-line px-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">ADD LANE</h2>
        <button type="button" className="ctrl h-6 px-2" onClick={close}>
          ESC ×
        </button>
      </div>
      <ul>
        {SOURCES.map((src) => {
          const blocked =
            (src.kind === "music3" && (bridgeOnline === false || !music3Up)) ||
            (src.kind === "acestep" && !acestepPresent);
          const reason =
            src.kind === "music3" && bridgeOnline === false
              ? "GPU BRIDGE OFFLINE"
              : src.kind === "music3" && !music3Up
                ? "MUSIC3 NOT UP"
                : src.kind === "acestep"
                  ? "ACE-STEP NOT PRESENT"
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
                className="flex h-9 w-full items-center gap-2 border-b border-line px-3 text-left hover:bg-bg3 disabled:opacity-40"
              >
                <span className={`h-4 w-[3px] ${STRIPE[src.kind]}`} />
                <span className="w-24 text-[12px] font-semibold">{src.title}</span>
                <span className={`flex-1 text-[12px] ${blocked ? "text-alert" : "text-fg-dim"}`}>
                  {blocked ? reason : src.blurb}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mx-3 mt-4 block border border-dashed border-line px-3 py-4 text-center text-[12px] text-fg-dim hover:border-line-strong">
        {uploading ? "IMPORTING…" : "IMPORT AUDIO OR VIDEO"}
        <input
          ref={fileInput}
          type="file"
          disabled={uploading}
          accept="audio/wav,audio/mpeg,audio/flac,audio/ogg,audio/mp4,audio/x-m4a,video/mp4,video/webm,.wav,.mp3,.flac,.ogg,.m4a,.mp4,.webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
      </label>
      {error && <p className="mt-3 px-3 font-mono text-[12px] text-alert">{error}</p>}
    </aside>
  );
}
