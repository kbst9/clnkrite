import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

export function ClipMenu() {
  const clipId = useUiStore((s) => s.contextClipId);
  const xy = useUiStore((s) => s.contextXY);
  const explodeId = useUiStore((s) => s.explodeClipId);
  const close = () => {
    useUiStore.getState().setContextMenu(null);
    useUiStore.getState().setExplodeClipId(null);
  };
  const doc = useProjectStore((s) => s.doc);
  const submit = useJobStore((s) => s.submit);
  const clip = doc?.clips.find((item) => item.id === clipId);
  const lane = clip ? doc?.lanes.find((item) => item.id === clip.laneId) : null;
  const asset = clip?.assetId ? doc?.assets.find((item) => item.id === clip.assetId) : null;
  if (!clip || !xy) return null;
  const canExplode = asset && (asset.source === "music3" || asset.source === "acestep") && Boolean(doc);

  return (
    <div className="fixed z-40 min-w-48 border border-line bg-bg1 py-0" style={{ left: xy.x, top: xy.y }}>
      {canExplode && explodeId !== clip.id && (
        <button
          type="button"
          className="block h-6 w-full px-3 text-left text-[12px] leading-4 hover:bg-bg3"
          onClick={() => useUiStore.getState().setExplodeClipId(clip.id)}
        >
          Explode into stems
        </button>
      )}
      {canExplode && explodeId === clip.id && (
        <div className="border-b border-line px-3 py-2 text-[12px] leading-4 text-fg-dim">
          First Demucs run downloads ~2 GB of weights on the GPU box. A 60 s track takes roughly 0.5–2 min.
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="ctrl-accent h-6 px-2"
              onClick={() => {
                if (!doc || !asset) return;
                void submit(doc.project.id, {
                  kind: "demucs_split",
                  laneId: clip.laneId,
                  params: { sourceAssetId: asset.id, sourceClipId: clip.id, playheadBeats: clip.startBeats },
                });
                close();
              }}
            >
              EXPLODE
            </button>
            <button type="button" className="ctrl h-6" onClick={() => useUiStore.getState().setExplodeClipId(null)}>
              CANCEL
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="block h-6 w-full px-3 text-left text-[12px] leading-4 hover:bg-bg3"
        onClick={() => {
          useProjectStore.getState().removeClips([clip.id]);
          close();
        }}
      >
        Delete
      </button>
      {lane?.kind === "music3" && (
        <p className="px-3 py-2 text-[11px] text-fg-faint">Music3 writes the whole band. Want parts? Explode into stems.</p>
      )}
    </div>
  );
}
