import { afterEach, describe, expect, it, vi } from "vitest";
import { toneEngine } from "../src/client/engine/toneEngine";
import { useTransportStore } from "../src/client/stores/transportStore";

afterEach(() => {
  vi.restoreAllMocks();
  useTransportStore.setState({ playing: false, playheadBeats: 0, seekRevision: 0 });
});

describe("picture transport sync", () => {
  it("distinguishes explicit seeks from rAF playhead ticks", () => {
    vi.spyOn(toneEngine, "playheadBeats").mockReturnValue(3);
    vi.spyOn(toneEngine, "seekSeconds").mockImplementation(() => undefined);
    useTransportStore.setState({ playing: true, playheadBeats: 0, seekRevision: 0 });

    useTransportStore.getState().tick(120);
    expect(useTransportStore.getState()).toMatchObject({ playheadBeats: 3, seekRevision: 0 });

    useTransportStore.getState().setPlayhead(8, 120);
    expect(useTransportStore.getState()).toMatchObject({ playheadBeats: 8, seekRevision: 1 });

    vi.spyOn(toneEngine, "stop").mockImplementation(() => undefined);
    useTransportStore.getState().stop();
    expect(useTransportStore.getState()).toMatchObject({ playing: false, playheadBeats: 0, seekRevision: 2 });
  });
});
