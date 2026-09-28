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
