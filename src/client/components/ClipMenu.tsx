import { useJobStore } from "../stores/jobStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

export function ClipMenu() {
  const clipId = useUiStore((s) => s.contextClipId);
  const xy = useUiStore((s) => s.contextXY);
  const close = () => useUiStore.getState().setContextMenu(null);
  const doc = useProjectStore((s) => s.doc);
  const submit = useJobStore((s) => s.submit);
  const clip = doc?.clips.find((item) => item.id === clipId);
  const lane = clip ? doc?.lanes.find((item) => item.id === clip.laneId) : null;
  const asset = clip?.assetId ? doc?.assets.find((item) => item.id === clip.assetId) : null;
  if (!clip || !xy) return null;
  const canExplode =
    asset && (asset.source === "music3" || asset.source === "acestep") && Boolean(doc);

  return (
    <div
      className="fixed z-40 min-w-48 rounded-md border border-line bg-panel py-1 shadow-2xl"
      style={{ left: xy.x, top: xy.y }}
    >
      {canExplode && (
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-sm hover:bg-rail"
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
          Explode into stems
        </button>
      )}
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-sm hover:bg-rail"
        onClick={() => {
          useProjectStore.getState().removeClips([clip.id]);
          close();
        }}
      >
        Delete
      </button>
      {lane?.kind === "music3" && (
        <p className="px-3 py-2 text-[11px] text-mute">Music3 writes the whole band. Want parts? Explode into stems.</p>
      )}
    </div>
  );
}
