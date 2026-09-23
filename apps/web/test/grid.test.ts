import { describe, it, expect } from "vitest";
import { colVars, gridClass } from "@/lib/grid";

describe("colVars — a column's placement at each breakpoint", () => {
  it("defaults to a full-width row", () => {
    expect(colVars({})).toEqual({
      "--span": "12", "--start": "auto",
      "--md-span": "12", "--md-start": "auto",
      "--sm-span": "12", "--sm-start": "auto",
    });
  });
  it("lets md inherit lg, and makes sm full width unless told otherwise", () => {
    expect(colVars({ span: 8 })).toMatchObject({
      "--span": "8", "--md-span": "8", "--sm-span": "12",
    });
  });
  it("accepts a bare number as a span at a breakpoint", () => {
    expect(colVars({ span: 4, md: 12 })).toMatchObject({ "--md-span": "12", "--md-start": "auto" });
  });
  it("places a centred column with a start", () => {
    expect(colVars({ start: 4, span: 6, sm: 12 })).toMatchObject({
      "--start": "4", "--span": "6", "--md-start": "4", "--md-span": "6", "--sm-span": "12",
    });
  });
  it("refuses a span or start that cannot fit twelve columns", () => {
    expect(() => colVars({ span: 13 })).toThrow(RangeError);
    expect(() => colVars({ span: 0 })).toThrow(RangeError);
    expect(() => colVars({ start: 10, span: 4 })).toThrow(RangeError);
  });
});

describe("gridClass — the grid container's classes", () => {
  it("is just the grid by default", () => {
    expect(gridClass({})).toBe("grid");
  });
  it("adds dense packing only when asked", () => {
    expect(gridClass({ dense: true })).toBe("grid is-dense");
    expect(gridClass({ dense: false })).toBe("grid");
  });
  it("keeps a caller's class", () => {
    expect(gridClass({ dense: true, className: "x" })).toBe("grid is-dense x");
  });
});
