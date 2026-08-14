import { useEffect, useState } from "react";
import { Editor } from "./pages/Editor";
import { ProjectList } from "./pages/ProjectList";

function routeFromPath(path: string): { name: "list" } | { name: "editor"; id: string } {
  const match = path.match(/^\/p\/([^/]+)/);
  if (match?.[1]) return { name: "editor", id: match[1] };
  return { name: "list" };
}

export function App() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (route.name === "editor") return <Editor projectId={route.id} />;
  return <ProjectList />;
}
