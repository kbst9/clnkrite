import { formatPlayhead } from "@shared/beats";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";
import { clearLocalCache } from "../lib/cache";

function Pair({
  label,
  value,
  onChange,
  width = "w-14",
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (next: string) => void;
  width?: string;
  type?: string;
}) {
  return (
    <label className="flex h-7 items-center gap-1 border border-line bg-bg2 px-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">{label}</span>
      <input
        type={type}
        className={`${width} border-0 bg-transparent px-0 py-0 text-[12px] leading-4 text-fg`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function CommandBar() {
  const project = useProjectStore((s) => s.doc?.project);
  const patchProject = useProjectStore((s) => s.patchProject);
  const playing = useTransportStore((s) => s.playing);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const loop = useTransportStore((s) => s.loop);
  const play = useTransportStore((s) => s.play);
  const stop = useTransportStore((s) => s.stop);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const snapOn = useUiStore((s) => s.snapOn);
  const snapBeats = useUiStore((s) => s.snapBeats);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  const openDrawer = useUiStore((s) => s.openDrawer);

  if (!project) return null;

  return (
    <div className="flex h-10 items-center gap-2 border-b border-line bg-bg1 px-2">
      <button
        type="button"
        className={`h-7 min-w-14 border px-2 text-[12px] font-semibold uppercase tracking-[0.06em] ${
          playing ? "border-fg bg-fg text-bg0" : "border-line bg-bg0 text-fg"
        }`}
        onClick={() => {
          if (playing) stop();
          else void play(project.bpm, project.loopStartBeats, project.loopEndBeats);
        }}
      >
        {playing ? "STOP" : "PLAY"}
      </button>
      <button
        type="button"
        className={`ctrl ${loop ? "ctrl-on" : ""}`}
        onClick={() => {
          toggleLoop();
          if (!loop && (project.loopStartBeats == null || project.loopEndBeats == null)) {
            patchProject({ loopStartBeats: 0, loopEndBeats: project.lengthBeats });
          }
        }}
      >
        LOOP
      </button>
      <span className="min-w-[5.5rem] text-[16px] font-semibold leading-5 text-fg">
        {formatPlayhead(playheadBeats, project.timeSig)}
      </span>
      <Pair
        label="BPM"
        type="number"
        width="w-10"
        value={project.bpm}
        onChange={(v) => patchProject({ bpm: Number(v) || 120 })}
      />
      <Pair label="KEY" width="w-16" value={project.keySig} onChange={(v) => patchProject({ keySig: v })} />
      <Pair
        label="SIG"
        width="w-10"
        value={project.timeSig}
        onChange={(v) => patchProject({ timeSig: v || "4/4" })}
      />
      <Pair
        label="LEN"
        type="number"
        width="w-12"
        value={project.lengthBeats}
        onChange={(v) => patchProject({ lengthBeats: Number(v) || 128 })}
      />
      <label className="flex h-7 items-center gap-1 border border-line bg-bg2 px-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">LOOP</span>
        <span className="text-[12px] text-fg">
          {project.loopStartBeats ?? 0}–{project.loopEndBeats ?? project.lengthBeats}
        </span>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={`ctrl ${snapOn ? "ctrl-on" : ""}`} onClick={toggleSnap}>
          SNAP {snapOn ? (snapBeats === 0.25 ? "1/4" : String(snapBeats)) : "OFF"}
        </button>
        <button
          type="button"
          className="ctrl"
          onClick={() => void clearLocalCache()}
          title="IndexedDB cache only — D1 is truth"
        >
          CACHE CLR
        </button>
        <button type="button" className="ctrl-accent" onClick={() => openDrawer("generate")}>
          GENERATE
        </button>
      </div>
    </div>
  );
}
