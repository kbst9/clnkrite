import { CommandBar } from "./CommandBar";
import { StatusStrip } from "./StatusStrip";

export function TopBar() {
  return (
    <header>
      <StatusStrip />
      <CommandBar />
    </header>
  );
}
