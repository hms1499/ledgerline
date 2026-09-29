import { describe, it, expect } from "vitest";
import { frameTime } from "./screencast.js";

describe("frameTime — when a screencast frame was on screen", () => {
  it("is the browser's own timestamp when it has one", () => {
    expect(frameTime(10, 10.5, 11)).toEqual({ at: 10.5, adjusted: false });
  });

  it("never goes back: arrival order is display order, so a stamp earlier than the last frame's is held at it", () => {
    expect(frameTime(10.5, 10.2, 11)).toEqual({ at: 10.5, adjusted: true });
  });

  it("falls back to the arrival time, still never going back", () => {
    expect(frameTime(10, undefined, 11)).toEqual({ at: 11, adjusted: true });
    expect(frameTime(12, undefined, 11)).toEqual({ at: 12, adjusted: true });
  });

  it("takes the first frame's stamp as it is", () => {
    expect(frameTime(undefined, 3, 4)).toEqual({ at: 3, adjusted: false });
  });
});
