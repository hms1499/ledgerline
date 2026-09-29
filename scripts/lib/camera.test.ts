import { describe, it, expect } from "vitest";
import { cameraAt, cropFor, easeInOut, framing, MOVE, type Focus } from "./camera.js";

const VIEW = { width: 1920, height: 1080 };
const MID = { x: 800, y: 400, width: 320, height: 200 };

describe("easeInOut", () => {
  it("starts at 0, ends at 1, crosses 0.5 at half time, never goes back", () => {
    expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
    for (let u = 0; u < 1; u += 0.05) expect(easeInOut(u + 0.05)).toBeGreaterThanOrEqual(easeInOut(u));
  });
});

describe("framing", () => {
  it("centres a small element at the zoom cap", () => {
    expect(framing(MID, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
  });

  it("zooms a wide element only as far as it fits, with padding", () => {
    const f = framing({ x: 100, y: 300, width: 1600, height: 200 }, VIEW, 2);
    expect(f.scale).toBeCloseTo(1920 / (1600 + 96));
  });

  it("honours an asked-for zoom, never past the cap and never under 1", () => {
    expect(framing(MID, VIEW, 2, 1.3).scale).toBe(1.3);
    expect(framing(MID, VIEW, 2, 3).scale).toBe(2);
    expect(framing(MID, VIEW, 2, 0.5).scale).toBe(1);
  });

  it("never shows past the frame's edge", () => {
    expect(framing({ x: 0, y: 0, width: 100, height: 50 }, VIEW, 2)).toEqual({ cx: 480, cy: 270, scale: 2 });
    expect(framing({ x: 1900, y: 1060, width: 20, height: 20 }, VIEW, 2)).toEqual({ cx: 1440, cy: 810, scale: 2 });
  });

  it("frames the whole view for the wide shot", () => {
    expect(framing(null, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });
});

describe("cameraAt", () => {
  const focuses: Focus[] = [{ at: 1, rect: MID }];

  it("is the wide shot before the first focus", () => {
    expect(cameraAt(0.5, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });

  it("arrives at the framing once the move is over, and holds it", () => {
    expect(cameraAt(1 + MOVE, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
    expect(cameraAt(10, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
  });

  it("zooms evenly: halfway through the move is halfway in log scale", () => {
    const c = cameraAt(1 + MOVE / 2, focuses, VIEW, 2);
    expect(c.scale).toBeCloseTo(Math.SQRT2);
    expect(c.cy).toBeCloseTo(520);
  });

  it("an interrupted move starts where the camera is", () => {
    const f: Focus[] = [{ at: 0, rect: MID }, { at: 0.3, rect: { x: 1500, y: 800, width: 200, height: 100 } }];
    const before = cameraAt(0.2999, f, VIEW, 2);
    const after = cameraAt(0.3, f, VIEW, 2);
    expect(Math.abs(after.cx - before.cx)).toBeLessThan(1);
    expect(Math.abs(after.cy - before.cy)).toBeLessThan(1);
    expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.01);
  });

  it("goes back to the wide shot on a focus with no element", () => {
    const f: Focus[] = [{ at: 0, rect: MID }, { at: 2, rect: null }];
    expect(cameraAt(2 + MOVE, f, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });
});

describe("cropFor", () => {
  it("is the camera's window in device pixels, 16:9, inside the frame", () => {
    expect(cropFor({ cx: 960, cy: 540, scale: 2 }, VIEW, 2)).toEqual({ left: 960, top: 540, width: 1920, height: 1080 });
    expect(cropFor({ cx: 960, cy: 540, scale: 1 }, VIEW, 2)).toEqual({ left: 0, top: 0, width: 3840, height: 2160 });
  });

  it("stays whole pixels and in bounds at an awkward scale", () => {
    const c = cropFor({ cx: 1500, cy: 900, scale: 1.37 }, VIEW, 1.5);
    for (const v of Object.values(c)) expect(Number.isInteger(v)).toBe(true);
    expect(c.left + c.width).toBeLessThanOrEqual(2880);
    expect(c.top + c.height).toBeLessThanOrEqual(1620);
  });
});
