import type { LaneKind } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";
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
  const loadProject = useProjectStore((s) => s.loadProject);

  if (drawer !== "add-lane") return null;

  async function add(kind: LaneKind) {
    const lane = await addLane({ kind });
    close();
    if (lane && (kind === "music3" || kind === "acestep")) openDrawer("generate");
  }

  async function onImport(file: File) {
    if (!projectId) return;
    const form = new FormData();
    form.append("file", file);
    await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
    await loadProject(projectId);
    close();
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
                disabled={blocked}
                onClick={() => void add(src.kind)}
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
        Import audio file
        <input
          type="file"
          accept="audio/wav,audio/mpeg,audio/flac,audio/ogg,audio/mp4,audio/x-m4a,.wav,.mp3,.flac,.ogg,.m4a"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
      </label>
    </aside>
  );
}
