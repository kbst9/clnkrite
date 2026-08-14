import type { Lane } from "@shared/types";
import { parseSynthConfig, SYNTH_TYPES } from "@shared/synth";
import { nextStemHeaderMute } from "@shared/stems";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

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
  const doc = useProjectStore((s) => s.doc);
  const selected = useTransportStore((s) => s.selectedLaneIds.includes(lane.id));
  const toggleLaneSelected = useTransportStore((s) => s.toggleLaneSelected);
  const children = doc?.lanes.filter((item) => item.parentLaneId === lane.id) ?? [];
  const synth = parseSynthConfig(lane.synthConfig);

  return (
    <div
      className={`flex h-16 items-center gap-2 border-b border-line px-2 ${
        selected ? "bg-brass/10" : "bg-rail"
      }`}
    >
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
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={(e) => toggleLaneSelected(lane.id, e.shiftKey)}
        title="Select lane for playback together"
      >
        <input
          className={`w-full border-0 bg-transparent px-0 py-0 text-sm font-semibold ${KIND_TINT[lane.kind]}`}
          value={lane.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => patchLane(lane.id, { name: e.target.value })}
        />
        <div className="font-mono text-[9px] uppercase tracking-widest text-mute">
          {lane.kind}
          {lane.stemRole ? ` · ${lane.stemRole}` : ""}
        </div>
      </button>
      {children.length > 0 && (
        <button
          type="button"
          className="rounded-sm border border-line px-1 font-mono text-[9px] uppercase text-brass"
          title="Toggle parent vs stems"
          onClick={() => {
            const next = nextStemHeaderMute(lane.muted);
            patchLane(lane.id, { muted: next.parentMuted, visible: !next.parentMuted });
            for (const child of children) {
              patchLane(child.id, { muted: next.childrenMuted, visible: !next.childrenMuted });
            }
          }}
        >
          stems
        </button>
      )}
      {lane.kind === "synth" && (
        <select
          className="w-20 bg-ink px-1 py-0.5 font-mono text-[9px]"
          value={synth.type}
          onChange={(e) => patchLane(lane.id, { synthConfig: JSON.stringify({ type: e.target.value }) })}
        >
          {SYNTH_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      )}
      {lane.kind === "picture" && (
        <button
          type="button"
          className={`h-6 w-6 font-mono text-[10px] ${lane.visible ? "text-brass" : "text-mute"}`}
          title="Show/hide picture"
          onClick={() => {
            patchLane(lane.id, { visible: !lane.visible });
            useUiStore.getState().setPictureOpen(!lane.visible);
          }}
        >
          V
        </button>
      )}
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
