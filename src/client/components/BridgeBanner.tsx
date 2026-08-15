import { useUiStore } from "../stores/uiStore";

export function BridgeBanner() {
  const online = useUiStore((s) => s.bridgeOnline);
  if (online !== false) return null;
  return (
    <div className="border-b border-line border-l-2 border-l-alert bg-bg0 px-3 py-1.5 text-[12px] leading-4 text-alert">
      GPU bridge offline — editing, playback, and persistence still work. Generation and stem explode are disabled.
    </div>
  );
}
