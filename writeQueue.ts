export type QueuedWrite = {
  id: string;
  run: (init?: RequestInit) => Promise<void>;
};

export class WriteQueue {
  private items: QueuedWrite[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  readonly delayMs: number;

  constructor(delayMs = 500) {
    this.delayMs = delayMs;
  }

  enqueue(item: QueuedWrite): void {
    this.items = this.items.filter((q) => q.id !== item.id);
    this.items.push(item);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delayMs);
  }

  async flush(init?: RequestInit): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) return;
    this.flushing = true;
    const batch = this.items.splice(0, this.items.length);
    try {
      for (const item of batch) {
        try {
          await item.run(init);
        } catch (err) {
          console.error("write queue failed", item.id, err);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  get pending(): number {
    return this.items.length;
  }
}

export function attachFlushListeners(queue: WriteQueue): () => void {
  const onHide = () => {
    void queue.flush({ keepalive: true });
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") onHide();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
  };
}
