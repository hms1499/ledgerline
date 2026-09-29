import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline.js";

const frames = [{ at: 10 }, { at: 11 }, { at: 12 }];

describe("buildTimeline", () => {
  it("keeps real time when nothing is sped up", () => {
    const t = buildTimeline(frames, 13, () => 1);
    expect(t.durations).toEqual([1, 1, 1]);
    expect(t.outputTime(10)).toBe(0);
    expect(t.outputTime(11.5)).toBeCloseTo(1.5);
    expect(t.outputTime(13)).toBeCloseTo(3);
  });

  it("compresses a wait by its speed", () => {
    const t = buildTimeline(frames, 13, (s) => (s >= 11 && s < 12 ? 4 : 1));
    expect(t.durations).toEqual([1, 0.25, 1]);
    expect(t.outputTime(11.5)).toBeCloseTo(1.125);
    expect(t.outputTime(12.5)).toBeCloseTo(1.75);
  });

  it("puts anything before the first frame at the start", () => {
    expect(buildTimeline(frames, 13, () => 1).outputTime(3)).toBe(0);
  });
});

describe("frameAt — the frame on screen at a moment of the video", () => {
  const at = [{ at: 0 }, { at: 1 }, { at: 2 }];

  it("holds each frame until the next one's start", () => {
    const tl = buildTimeline(at, 3, () => 1);
    expect(tl.total).toBe(3);
    expect([tl.frameAt(0), tl.frameAt(0.5), tl.frameAt(1), tl.frameAt(2.9)]).toEqual([0, 0, 1, 2]);
  });

  it("clamps outside the video", () => {
    const tl = buildTimeline(at, 3, () => 1);
    expect(tl.frameAt(-1)).toBe(0);
    expect(tl.frameAt(99)).toBe(2);
  });

  it("follows a wait played faster", () => {
    const tl = buildTimeline(at, 3, (t) => (t >= 1 && t < 2 ? 4 : 1));
    expect(tl.total).toBeCloseTo(2.25);
    expect(tl.frameAt(1.1)).toBe(1);
    expect(tl.frameAt(1.3)).toBe(2);
  });
});
