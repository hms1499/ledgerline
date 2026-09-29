import { describe, it, expect } from "vitest";
import { STILL } from "./still.js";

/** Runs STILL against a stand-in document. */
function still(animations: [playState: string, iterations: number][], counting = false): boolean {
  const document = {
    getAnimations: () => animations.map(([playState, iterations]) =>
      ({ playState, effect: { getComputedTiming: () => ({ iterations }) } })),
    querySelector: (s: string) => (s === "[data-counting]" && counting ? {} : null),
  };
  return new Function("document", `return ${STILL};`)(document) as boolean;
}

describe("STILL — nothing moving that a viewer waits for", () => {
  it("is still when nothing runs, or what ran has finished", () => {
    expect(still([])).toBe(true);
    expect(still([["finished", 1]])).toBe(true);
  });

  it("waits for a finite animation that is running: a page arriving, a block staggering in", () => {
    expect(still([["running", 1]])).toBe(false);
  });

  it("never waits for an infinite one: the feed line, a skeleton, the heartbeat", () => {
    expect(still([["running", Infinity]])).toBe(true);
  });

  it("waits for a count that is rolling", () => {
    expect(still([], true)).toBe(false);
  });
});
