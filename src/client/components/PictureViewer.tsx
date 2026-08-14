import { useEffect, useRef } from "react";
import { beatsToSec } from "@shared/beats";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

export function PictureViewer() {
  const doc = useProjectStore((s) => s.doc);
  const playing = useTransportStore((s) => s.playing);
  const playheadBeats = useTransportStore((s) => s.playheadBeats);
  const pictureOpen = useUiStore((s) => s.pictureOpen);
  const setPictureOpen = useUiStore((s) => s.setPictureOpen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lane = doc?.lanes.find((item) => item.kind === "picture");
  const clip = lane ? doc?.clips.find((item) => item.laneId === lane.id) : undefined;
  const asset = clip?.assetId ? doc?.assets.find((item) => item.id === clip.assetId) : undefined;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || !doc) return;
    const target = Math.max(0, beatsToSec(playheadBeats - clip.startBeats, doc.project.bpm));
    if (Math.abs(video.currentTime - target) > 0.06) video.currentTime = target;
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [playheadBeats, playing, clip, doc]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const state = useTransportStore.getState();
      const project = useProjectStore.getState().doc;
      if (!video || !clip || !project) return;
      const target = Math.max(0, beatsToSec(state.playheadBeats - clip.startBeats, project.project.bpm));
      if (Math.abs(video.currentTime - target) > 0.06) video.currentTime = target;
    }, 250);
    return () => window.clearInterval(id);
  }, [clip]);

  if (!lane || !lane.visible || !pictureOpen || !clip || !asset) return null;

  return (
    <div className="absolute bottom-4 right-4 z-30 w-[360px] overflow-hidden rounded-md border border-line bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-mute">
        Picture
        <button type="button" onClick={() => setPictureOpen(false)}>
          hide
        </button>
      </div>
      <video
        ref={videoRef}
        className="aspect-video w-full bg-ink"
        src={`/api/assets/${asset.id}/blob`}
        muted
        playsInline
      />
    </div>
  );
}
