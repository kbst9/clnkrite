import { useRef } from "react";
import type { Lane } from "@shared/types";
import { parseSynthConfig, SYNTH_TYPES } from "@shared/synth";
import { nextStemHeaderMute } from "@shared/stems";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

const KIND_STRIPE: Record<Lane["kind"], string> = {
  music3: "bg-lane-music3",
  acestep: "bg-lane-acestep",
  synth: "bg-lane-synth",
  import: "bg-lane-import",
  picture: "bg-lane-picture",
};

function Toggle({
  label,
  on,
  onClass,
  onClick,
}: {
  label: string;
  on: boolean;
  onClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`h-[18px] w-[18px] border border-line text-[10px] leading-[14px] ${
        on ? onClass : "text-fg-faint"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Scrub({
  label,
  display,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  return (
    <button
      type="button"
      className="cursor-ew-resize text-[10px] leading-[14px] text-fg-dim"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const delta = (e.clientX - drag.current.x) * ((max - min) / 160);
        const next = Math.min(max, Math.max(min, drag.current.value + delta));
        onChange(next);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {label} {display}
    </button>
  );
}

function panLabel(pan: number): string {
  const n = Math.round(pan * 100);
  if (n === 0) return "C";
  return n < 0 ? `L${Math.abs(n)}` : `R${n}`;
}

export function LaneHeader({ lane }: { lane: Lane }) {
  const patchLane = useProjectStore((s) => s.patchLane);
  const removeLane = useProjectStore((s) => s.removeLane);
  const doc = useProjectStore((s) => s.doc);
  const selected = useTransportStore((s) => s.selectedLaneIds.includes(lane.id));
  const toggleLaneSelected = useTransportStore((s) => s.toggleLaneSelected);
  const children = doc?.lanes.filter((item) => item.parentLaneId === lane.id) ?? [];
  const synth = parseSynthConfig(lane.synthConfig);

  return (
    <div className={`flex h-12 flex-col justify-center border-b border-line px-1 ${selected ? "bg-bg3" : "bg-bg1"}`}>
      <div className="flex h-6 items-center gap-1">
        <span className={`h-4 w-[3px] shrink-0 ${KIND_STRIPE[lane.kind]}`} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={(e) => toggleLaneSelected(lane.id, e.shiftKey)}
          title="Select lane for playback together"
        >
          <input
            className="w-full border-0 bg-transparent px-0 py-0 text-[12px] leading-4 text-fg"
            value={lane.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => patchLane(lane.id, { name: e.target.value })}
          />
        </button>
        <Toggle
          label="R"
          on={lane.armed}
          onClass="border-alert bg-alert text-bg0"
          onClick={() => patchLane(lane.id, { armed: !lane.armed })}
        />
        <Toggle
          label="M"
          on={lane.muted}
          onClass="border-warn bg-warn text-bg0"
          onClick={() => patchLane(lane.id, { muted: !lane.muted })}
        />
        <Toggle
          label="S"
          on={lane.soloed}
          onClass="border-accent bg-accent text-bg0"
          onClick={() => patchLane(lane.id, { soloed: !lane.soloed })}
        />
        {lane.kind === "picture" && (
          <Toggle
            label="V"
            on={lane.visible}
            onClass="border-ok bg-ok text-bg0"
            onClick={() => {
              patchLane(lane.id, { visible: !lane.visible });
              useUiStore.getState().setPictureOpen(!lane.visible);
            }}
          />
        )}
      </div>
      <div className="flex h-5 items-center gap-2 px-1">
        <Scrub
          label="VOL"
          display={lane.volumeDb.toFixed(1)}
          value={lane.volumeDb}
          min={-60}
          max={6}
          onChange={(v) => patchLane(lane.id, { volumeDb: Math.round(v * 2) / 2 })}
        />
        <Scrub
          label="PAN"
          display={panLabel(lane.pan)}
          value={lane.pan}
          min={-1}
          max={1}
          onChange={(v) => patchLane(lane.id, { pan: Math.round(v * 100) / 100 })}
        />
        {children.length > 0 && (
          <button
            type="button"
            className="border border-line px-1 text-[10px] uppercase text-accent"
            title="Toggle parent vs stems"
            onClick={() => {
              const next = nextStemHeaderMute(lane.muted);
              patchLane(lane.id, { muted: next.parentMuted, visible: !next.parentMuted });
              for (const child of children) {
                patchLane(child.id, { muted: next.childrenMuted, visible: !next.childrenMuted });
              }
            }}
          >
            STEMS·{children.length}
          </button>
        )}
        {lane.kind === "synth" && (
          <select
            className="h-4 w-20 border-line bg-bg2 px-0.5 text-[10px]"
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
        <button
          type="button"
          className="ml-auto text-fg-faint hover:text-alert"
          title="Remove lane"
          onClick={() => removeLane(lane.id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
