import { describe, it, expect } from "vitest";
import { audioArgs, maxZoomFor, renderPlan } from "./render-plan.js";
import type { TakeEvents } from "./take.js";

const take: TakeEvents = {
  version: 1, network: "testnet", runName: "video-2026-09-29-t1", date: "2026-09-29",
  view: { width: 1920, height: 1080, scale: 2 }, begin: 100, end: 104,
  frames: [{ file: "a", at: 100 }, { file: "b", at: 101 }, { file: "c", at: 102 }],
  waits: [{ from: 102, to: 104 }],
  focuses: [{ at: 101, rect: { x: 800, y: 400, width: 320, height: 200 }, label: "x" }],
  captions: [{ at: 100, step: "1 · Upload", text: "a" }, { at: 102, step: "2 · Review", text: "b" }],
};
const O = { fps: 10, titleSeconds: 1, waitSpeed: 4 };

describe("renderPlan", () => {
  const plan = renderPlan(take, O);

  it("opens on the title card, then plays the take with waits sped up", () => {
    expect(plan.seconds).toBeCloseTo(1 + 2 + 0.5);
    expect(plan.frames.length).toBe(35);
    expect(plan.frames.slice(0, 10).every((f) => f.kind === "title")).toBe(true);
    expect(plan.frames[10]).toMatchObject({ kind: "shot", source: 0, caption: 0 });
  });

  it("puts each caption up from its moment until the next", () => {
    const at = (s: number) => plan.frames[Math.round(s * O.fps)]!;
    expect(at(1 + 1.5)).toMatchObject({ caption: 0 });
    expect(at(1 + 2.2)).toMatchObject({ caption: 1, source: 2 });
  });

  it("has arrived at the focus once the move is over", () => {
    const f = plan.frames[Math.round((1 + 1 + 0.8) * O.fps)]!;
    expect(f).toMatchObject({ kind: "shot", crop: { left: 960, top: 460, width: 1920, height: 1080 } });
  });

  it("samples the contact sheet once per focus, after the camera arrives", () => {
    expect(plan.sheet).toEqual([Math.round((1 + 1 + 0.7 + 0.3) * O.fps)]);
  });
});

describe("maxZoomFor", () => {
  it("never zooms past the frame's own pixels", () => {
    expect([maxZoomFor(2), maxZoomFor(1.5), maxZoomFor(3)]).toEqual([2, 1.5, 2]);
  });
});

describe("audioArgs", () => {
  it("music loops to length, fades in and out, and is levelled for YouTube", () => {
    const a = audioArgs("song.mp3", 145, () => true);
    expect(a.slice(0, 4)).toEqual(["-stream_loop", "-1", "-i", "song.mp3"]);
    expect(a.at(-1)).toBe("[1:a]atrim=0:145,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st=143:d=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]");
  });

  it("gives a silent track when there is no music, so every upload has the same shape", () => {
    const a = audioArgs(undefined, 145, () => true);
    expect(a.slice(0, 4)).toEqual(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]);
    expect(a.at(-1)).toBe("[1:a]atrim=0:145,asetpts=PTS-STARTPTS[a]");
  });

  it("missing music fails before any frame is rendered", () => {
    expect(() => audioArgs("nope.mp3", 145, () => false)).toThrow(/no music file at nope.mp3/);
  });
});
