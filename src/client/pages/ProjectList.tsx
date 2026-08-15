import { useEffect, useState } from "react";
import { BridgeBanner } from "../components/BridgeBanner";
import { StatusStrip } from "../components/StatusStrip";
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
    <div className="flex min-h-full flex-col bg-bg0">
      <StatusStrip showProject={false} />
      <BridgeBanner />
      <form
        className="flex h-7 items-center gap-2 border-b border-line px-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createProject({ title: title || "Untitled" }).then((p) => open(p.id));
        }}
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">NEW PROJECT</span>
        <input
          className="h-7 flex-1 border-0 bg-transparent px-2 text-[12px]"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="ctrl-accent h-7">
          CREATE
        </button>
      </form>
      {loading && <p className="px-3 py-3 text-[12px] text-fg-faint">LOADING…</p>}
      {error && <p className="px-3 py-3 text-[12px] text-alert">{error}</p>}
      <div className="grid grid-cols-[1fr_64px_96px_48px_160px] border-b border-line px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        <span>TITLE</span>
        <span>BPM</span>
        <span>KEY</span>
        <span>SIG</span>
        <span>UPDATED</span>
      </div>
      {list.length === 0 && !loading && <p className="px-3 py-3 text-[12px] text-fg-faint">NO PROJECTS.</p>}
      <ul>
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="grid h-8 w-full grid-cols-[1fr_64px_96px_48px_160px] items-center px-3 text-left text-[12px] hover:bg-bg3"
              onClick={() => open(p.id)}
            >
              <span className="truncate text-[18px] font-semibold leading-6">{p.title}</span>
              <span className="text-fg-dim">{p.bpm}</span>
              <span className="text-fg-dim">{p.keySig}</span>
              <span className="text-fg-dim">{p.timeSig}</span>
              <span className="text-fg-faint">{new Date(p.updatedAt).toISOString().slice(0, 19).replace("T", " ")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-line px-3 py-2 text-[10px] leading-[14px] text-fg-faint">
        AGPL-3.0-or-later · source offered in this repository
      </p>
    </div>
  );
}
