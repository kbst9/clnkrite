import { useEffect, useState } from "react";
import { BridgeBanner } from "../components/BridgeBanner";
import { useProjectStore } from "../stores/projectStore";

export function ProjectList() {
  const list = useProjectStore((s) => s.list);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const loadList = useProjectStore((s) => s.loadList);
  const createProject = useProjectStore((s) => s.createProject);
  const [title, setTitle] = useState("");

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function open(id: string) {
    window.history.pushState({}, "", `/p/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="flex min-h-full flex-col">
      <BridgeBanner />
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-brass">clnkrite</p>
      <h1 className="mt-2 text-5xl font-semibold tracking-tight">The desk</h1>
      <p className="mt-3 max-w-lg text-mute">
        Local-first generative studio. D1 holds the session. The GPU stays on the other side of the
        tunnel.
      </p>
      <form
        className="mt-10 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createProject({ title: title || "Untitled" }).then((p) => open(p.id));
        }}
      >
        <input
          className="flex-1 px-3 py-2"
          placeholder="New project title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="bg-brass px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-ink"
        >
          New reel
        </button>
      </form>
      {loading && <p className="mt-8 font-mono text-sm text-mute">Loading…</p>}
      {error && <p className="mt-8 font-mono text-sm text-ember">{error}</p>}
      {!loading && list.length === 0 && (
        <p className="mt-8 font-mono text-sm text-mute">No sessions yet. Name one and start a reel.</p>
      )}
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex w-full items-baseline justify-between py-4 text-left hover:text-brass"
              onClick={() => open(p.id)}
            >
              <span className="text-lg">{p.title}</span>
              <span className="font-mono text-xs text-mute">
                {p.bpm} BPM · {p.keySig} · {p.timeSig}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-12 font-mono text-[10px] text-mute">
        AGPL-3.0-or-later · source offered in this repository
      </p>
    </div>
    </div>
  );
}
