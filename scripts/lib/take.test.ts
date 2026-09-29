import { describe, it, expect } from "vitest";
import { assertTake, unionRect, visibleRect, type TakeEvents } from "./take.js";

const VIEW = { width: 1920, height: 1080 };
const take = (over: Partial<TakeEvents> = {}): TakeEvents => ({
  version: 1, network: "testnet", runName: "video-2026-09-29-t1", date: "2026-09-29",
  view: { width: 1920, height: 1080, scale: 2 }, begin: 10, end: 20,
  frames: [{ file: "frames/f00000.jpg", at: 10 }, { file: "frames/f00001.jpg", at: 11 }],
  waits: [], focuses: [], captions: [], ...over,
});

describe("visibleRect", () => {
  it("refuses a focus outside the viewport, naming it", () => {
    expect(() => visibleRect(null, VIEW, "the drop zone")).toThrow(/the drop zone/);
    expect(() => visibleRect({ x: 0, y: 1200, width: 100, height: 40 }, VIEW, "Pay button")).toThrow(/Pay button/);
  });

  it("clips a box that runs past the edge to what is on screen", () => {
    expect(visibleRect({ x: -20, y: 1000, width: 200, height: 200 }, VIEW, "x"))
      .toEqual({ x: 0, y: 1000, width: 180, height: 80 });
  });
});

describe("unionRect", () => {
  it("is the smallest box holding them all", () => {
    expect(unionRect([{ x: 10, y: 20, width: 100, height: 10 }, { x: 50, y: 5, width: 10, height: 100 }]))
      .toEqual({ x: 10, y: 5, width: 100, height: 100 });
  });
});

describe("assertTake", () => {
  it("accepts a well-formed take", () => {
    expect(assertTake(JSON.parse(JSON.stringify(take()))).runName).toBe("video-2026-09-29-t1");
  });

  it("rejects a take with no frames, frames out of order, or an end before its start", () => {
    expect(() => assertTake(take({ frames: [] }))).toThrow(/no frames/);
    expect(() => assertTake(take({ frames: [{ file: "a", at: 12 }, { file: "b", at: 11 }] }))).toThrow(/order/);
    expect(() => assertTake(take({ end: 5 }))).toThrow(/end/);
  });

  it("rejects a network it cannot label", () => {
    expect(() => assertTake({ ...take(), network: "sepolia" })).toThrow(/network/);
  });
});
