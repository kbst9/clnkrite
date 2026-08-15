import { useEffect, useRef } from "react";
import { beatsToSec } from "@shared/beats";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useUiStore } from "../stores/uiStore";

export function PictureViewer() {
  const doc = useProjectStore((s) => s.doc);
  const playing = useTransportStore((s) => s.playing);
  const seekRevision = useTransportStore((s) => s.seekRevision);
  const pictureOpen = useUiStore((s) => s.pictureOpen);
  const setPictureOpen = useUiStore((s) => s.setPictureOpen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lane = doc?.lanes.find((item) => item.kind === "picture");
  const clip = lane ? doc?.clips.find((item) => item.laneId === lane.id) : undefined;
  const asset = clip?.assetId ? doc?.assets.find((item) => item.id === clip.assetId) : undefined;

  function reseat(video: HTMLVideoElement, currentPlayhead: number, shouldPlay: boolean): void {
    if (!clip || !doc) return;
    const relativeBeats = currentPlayhead - clip.startBeats;
    const insideClip = relativeBeats >= 0 && relativeBeats < clip.lengthBeats;
    const target = Math.max(0, beatsToSec(relativeBeats, doc.project.bpm));
    try {
      if (Math.abs(video.currentTime - target) > 0.06) video.currentTime = target;
    } catch {
      // Metadata may not be loaded yet; the next 250 ms reseat will retry.
    }
    if (shouldPlay && insideClip) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || !doc) return;
    reseat(video, useTransportStore.getState().playheadBeats, playing);
  }, [playing, seekRevision, clip, doc?.project.bpm, lane?.visible, pictureOpen]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const state = useTransportStore.getState();
      const project = useProjectStore.getState().doc;
      if (!video || !clip || !project) return;
      const relativeBeats = state.playheadBeats - clip.startBeats;
      const insideClip = relativeBeats >= 0 && relativeBeats < clip.lengthBeats;
      const target = Math.max(0, beatsToSec(relativeBeats, project.project.bpm));
      try {
        if (Math.abs(video.currentTime - target) > 0.06) video.currentTime = target;
      } catch {
        // Retry after metadata arrives.
      }
      if (state.playing && insideClip) {
        if (video.paused) void video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.pause();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [clip]);

  if (!lane || !lane.visible || !pictureOpen || !clip || !asset) return null;

  return (
    <div className="absolute bottom-4 right-4 z-30 w-[360px] border border-line bg-bg1">
      <div className="flex h-6 items-center justify-between border-b border-line px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        PICTURE
        <button type="button" className="text-fg-dim" onClick={() => setPictureOpen(false)}>
          HIDE
        </button>
      </div>
      <video
        ref={videoRef}
        className="aspect-video w-full bg-bg0"
        src={`/api/assets/${asset.id}/blob`}
        muted
        playsInline
      />
    </div>
  );
}
