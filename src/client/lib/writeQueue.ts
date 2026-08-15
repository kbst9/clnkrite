export type QueuedWrite = {
  id: string;
  run: (init?: RequestInit) => Promise<void>;
};

export class WriteQueue {
  private items: QueuedWrite[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  readonly delayMs: number;

  constructor(delayMs = 500) {
    this.delayMs = delayMs;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  enqueue(item: QueuedWrite): void {
    this.items = this.items.filter((q) => q.id !== item.id);
    this.items.push(item);
    this.notify();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delayMs);
  }

  flush(init?: RequestInit): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = this.drain(init).finally(() => {
      this.flushPromise = null;
      this.notify();
      if (this.items.length > 0) {
        this.schedule();
      } else if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    });
    return this.flushPromise;
  }

  private async drain(init?: RequestInit): Promise<void> {
    const failed = new Map<string, QueuedWrite>();
    while (this.items.length > 0) {
      const batch = this.items.splice(0, this.items.length);
      for (const item of batch) {
        try {
          await item.run(init);
          failed.delete(item.id);
        } catch (err) {
          console.error("write queue failed", item.id, err);
          failed.set(item.id, item);
        }
      }
    }

    for (const item of failed.values()) {
      if (!this.items.some((queued) => queued.id === item.id)) this.items.push(item);
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
