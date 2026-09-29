import { describe, it, expect } from "vitest";
import { COUNT_MS, countAt, easeOutCubic, firstShown } from "@/lib/count-up";

const roll = (from: number, to: number) => Array.from({ length: 81 }, (_, i) => countAt(from, to, i * 10));

describe("countAt — what a rolling count shows (spec 2026-09-29 §2.4)", () => {
  it("starts where it was and lands exactly on the value, then stays there", () => {
    expect(countAt(0, 12, 0)).toBe(0);
    expect(countAt(0, 12, COUNT_MS)).toBe(12);
    expect(countAt(0, 12, COUNT_MS * 3)).toBe(12);
  });

  it("shows whole numbers that never go back and never pass the value", () => {
    const seen = roll(0, 7);
    expect(seen.every(Number.isInteger)).toBe(true);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]!)).toBe(true);
    expect(Math.max(...seen)).toBe(7);
  });

  it("reaches the value only at the end", () => {
    expect(countAt(0, 1, COUNT_MS - 1)).toBe(0);
    expect(countAt(0, 7, COUNT_MS - 10)).toBe(6);
  });

  it("counts down to a smaller value without passing it", () => {
    const seen = roll(9, 4);
    expect(seen[0]).toBe(9);
    expect(seen.at(-1)).toBe(4);
    expect(seen.every((v, i) => i === 0 || v <= seen[i - 1]!)).toBe(true);
    expect(Math.min(...seen)).toBe(4);
  });

  it("a new roll starts from the old value", () => {
    expect(countAt(3, 5, 0)).toBe(3);
    expect(countAt(3, 5, COUNT_MS)).toBe(5);
  });

  it("eases out: most of the way in the first half", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(countAt(0, 100, COUNT_MS / 2)).toBe(87);
  });
});

describe("firstShown — a count's first frame", () => {
  it("is the value when the count is already in the server's HTML, or motion is reduced", () => {
    expect(firstShown(4, true, false)).toBe(4);
    expect(firstShown(4, false, true)).toBe(4);
  });

  it("is 0 when the count appears on the client and will count up", () => {
    expect(firstShown(4, false, false)).toBe(0);
  });
});
