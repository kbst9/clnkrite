import { formatPlayhead } from "@shared/beats";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";

export function Transport() {
  const project = useProjectStore((s) => s.doc?.project);
  const playing = useTransportStore((s) => s.playing);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const loop = useTransportStore((s) => s.loop);
  const play = useTransportStore((s) => s.play);
  const stop = useTransportStore((s) => s.stop);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const patchProject = useProjectStore((s) => s.patchProject);

  if (!project) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="h-8 min-w-16 rounded-sm bg-brass px-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-ink hover:brightness-110"
        onClick={() => {
          if (playing) stop();
          else void play(project.bpm, project.loopStartBeats, project.loopEndBeats);
        }}
      >
        {playing ? "Stop" : "Play"}
      </button>
      <span className="font-mono text-sm tabular-nums text-brass">
        {formatPlayhead(playheadBeats, project.timeSig)}
      </span>
      <button
        type="button"
        className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
          loop ? "border-brass text-brass" : "border-line text-mute"
        }`}
        onClick={() => {
          toggleLoop();
          if (!loop && (project.loopStartBeats == null || project.loopEndBeats == null)) {
            patchProject({ loopStartBeats: 0, loopEndBeats: project.lengthBeats });
          }
        }}
      >
        Loop
      </button>
    </div>
  );
}
