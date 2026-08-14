import type { Lane } from "@shared/types";
import { useProjectStore } from "../stores/projectStore";

const KIND_TINT: Record<Lane["kind"], string> = {
  music3: "text-lane-music3",
  acestep: "text-lane-acestep",
  synth: "text-lane-synth",
  import: "text-lane-import",
  picture: "text-lane-picture",
};

export function LaneHeader({ lane }: { lane: Lane }) {
  const patchLane = useProjectStore((s) => s.patchLane);
  const removeLane = useProjectStore((s) => s.removeLane);

  return (
    <div className="flex h-16 items-center gap-2 border-b border-line bg-rail px-2">
      <button
        type="button"
        title="Arm"
        className={`h-6 w-6 rounded-full border text-[10px] font-mono ${
          lane.armed ? "border-ember bg-ember text-paper" : "border-line text-mute"
        }`}
        onClick={() => patchLane(lane.id, { armed: !lane.armed })}
      >
        R
      </button>
      <div className="min-w-0 flex-1">
        <input
          className={`w-full border-0 bg-transparent px-0 py-0 text-sm font-semibold ${KIND_TINT[lane.kind]}`}
          value={lane.name}
          onChange={(e) => patchLane(lane.id, { name: e.target.value })}
        />
        <div className="font-mono text-[9px] uppercase tracking-widest text-mute">{lane.kind}</div>
      </div>
      <button
        type="button"
        className={`h-6 w-6 font-mono text-[10px] ${lane.muted ? "text-ember" : "text-mute"}`}
        onClick={() => patchLane(lane.id, { muted: !lane.muted })}
      >
        M
      </button>
      <button
        type="button"
        className={`h-6 w-6 font-mono text-[10px] ${lane.soloed ? "text-brass" : "text-mute"}`}
        onClick={() => patchLane(lane.id, { soloed: !lane.soloed })}
      >
        S
      </button>
      <label className="flex w-14 flex-col">
        <span className="font-mono text-[8px] text-mute">VOL</span>
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={lane.volumeDb}
          onChange={(e) => patchLane(lane.id, { volumeDb: Number(e.target.value) })}
        />
      </label>
      <label className="flex w-14 flex-col">
        <span className="font-mono text-[8px] text-mute">PAN</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={lane.pan}
          onChange={(e) => patchLane(lane.id, { pan: Number(e.target.value) })}
        />
      </label>
      <button
        type="button"
        className="text-mute hover:text-ember"
        title="Remove lane"
        onClick={() => removeLane(lane.id)}
      >
        ×
      </button>
    </div>
  );
}
