import { describe, expect, it } from "vitest";
import { computePeaks, parsePeaks, PEAKS_PX_PER_SEC } from "../src/client/lib/peaks";

describe("peaks sidecar", () => {
  it("round-trips min/max pairs through the v1 header", () => {
    const samples = new Float32Array(100);
    for (let i = 0; i < samples.length; i += 1) samples[i] = i % 2 === 0 ? -0.5 : 0.5;
    const buf = computePeaks(samples, 50, PEAKS_PX_PER_SEC);
    const parsed = parsePeaks(buf);
    expect(parsed).not.toBeNull();
    expect(parsed?.samplesPerPixel).toBe(1);
    expect(parsed?.pairs).toBe(100);
    expect(parsed?.min[0]).toBe(Math.round(-0.5 * 127));
    expect(parsed?.max[1]).toBe(Math.round(0.5 * 127));
  });

  it("rejects a truncated or unknown-version buffer", () => {
    expect(parsePeaks(new ArrayBuffer(2))).toBeNull();
    const bad = new ArrayBuffer(5);
    new DataView(bad).setUint8(0, 9);
    expect(parsePeaks(bad)).toBeNull();
  });
});
