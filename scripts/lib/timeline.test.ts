import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline.js";

const frames = [{ at: 10 }, { at: 11 }, { at: 12 }];
const NONE = { waits: [], factor: 1 };

describe("buildTimeline", () => {
  it("keeps real time when nothing is sped up", () => {
    const t = buildTimeline(frames, 13, NONE);
    expect(t.durations).toEqual([1, 1, 1]);
    expect(t.outputTime(10)).toBe(0);
    expect(t.outputTime(11.5)).toBeCloseTo(1.5);
    expect(t.outputTime(13)).toBeCloseTo(3);
  });

  it("compresses a wait by its speed", () => {
    const t = buildTimeline(frames, 13, { waits: [{ from: 11, to: 12 }], factor: 4 });
    expect(t.durations).toEqual([1, 0.25, 1]);
    expect(t.outputTime(11.5)).toBeCloseTo(1.125);
    expect(t.outputTime(12.5)).toBeCloseTo(1.75);
  });

  it("puts anything before the first frame at the start", () => {
    expect(buildTimeline(frames, 13, NONE).outputTime(3)).toBe(0);
  });

  it("compresses only the wait when a long still frame starts inside one", () => {
    // A still page sends no frames: one frame can last 17 s. Only the part of
    // it inside the wait may play faster.
    const t = buildTimeline([{ at: 0 }, { at: 10 }], 20, { waits: [{ from: 0, to: 1 }], factor: 4 });
    expect(t.durations).toEqual([9.25, 10]);
    expect(t.total).toBeCloseTo(19.25);
    expect(t.outputTime(5)).toBeCloseTo(4.25);
  });

  it("counts overlapping waits once", () => {
    const t = buildTimeline([{ at: 0 }], 10, { waits: [{ from: 1, to: 3 }, { from: 2, to: 4 }], factor: 4 });
    expect(t.total).toBeCloseTo(10 - 3 * 0.75);
  });
});

describe("frameAt — the frame on screen at a moment of the video", () => {
  const at = [{ at: 0 }, { at: 1 }, { at: 2 }];

  it("holds each frame until the next one's start", () => {
    const tl = buildTimeline(at, 3, NONE);
    expect(tl.total).toBe(3);
    expect([tl.frameAt(0), tl.frameAt(0.5), tl.frameAt(1), tl.frameAt(2.9)]).toEqual([0, 0, 1, 2]);
  });

  it("clamps outside the video", () => {
    const tl = buildTimeline(at, 3, NONE);
    expect(tl.frameAt(-1)).toBe(0);
    expect(tl.frameAt(99)).toBe(2);
  });

  it("follows a wait played faster", () => {
    const tl = buildTimeline(at, 3, { waits: [{ from: 1, to: 2 }], factor: 4 });
    expect(tl.total).toBeCloseTo(2.25);
    expect(tl.frameAt(1.1)).toBe(1);
    expect(tl.frameAt(1.3)).toBe(2);
  });
});
