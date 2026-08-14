import { useUiStore } from "../stores/uiStore";

export function BridgeBanner() {
  const online = useUiStore((s) => s.bridgeOnline);
  if (online !== false) return null;
  return (
    <div className="border-b border-ember/40 bg-ember/15 px-4 py-2 font-mono text-xs text-ember">
      GPU bridge offline — editing, playback, and persistence still work. Generation and stem explode are disabled.
    </div>
  );
}
