export interface Command {
  label: string;
  undo: () => void;
  redo: () => void;
}

export class UndoStack {
  private past: Command[] = [];
  private future: Command[] = [];

  push(command: Command): void {
    this.past.push(command);
    this.future = [];
  }

  undo(): boolean {
    const command = this.past.pop();
    if (!command) return false;
    command.undo();
    this.future.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.future.pop();
    if (!command) return false;
    command.redo();
    this.past.push(command);
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export const undoStack = new UndoStack();
