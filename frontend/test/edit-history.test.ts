import { describe, it, expect } from "vitest";
import { history, START } from "@/lib/edit-history";
import { NO_EDITS, editCells } from "@/lib/sheet-edits";

const a = editCells(NO_EDITS, [{ line: 2, col: "f0", text: "A" }]);
const b = editCells(a, [{ line: 2, col: "f0", text: "B" }]);

describe("history", () => {
  it("steps back and forward through whole edits", () => {
    let h = history(history(START, { type: "set", edits: a }), { type: "set", edits: b });
    h = history(h, { type: "undo" });
    expect(h.now).toBe(a);
    h = history(h, { type: "undo" });
    expect(h.now).toBe(NO_EDITS);
    expect(history(h, { type: "undo" })).toBe(h);
    h = history(h, { type: "redo" });
    expect(h.now).toBe(a);
  });

  it("forgets what could be redone once something new is set", () => {
    let h = history(history(START, { type: "set", edits: a }), { type: "undo" });
    h = history(h, { type: "set", edits: b });
    expect(h.future).toEqual([]);
    expect(history(h, { type: "redo" })).toBe(h);
  });

  it("keeps the last hundred steps", () => {
    let h = START;
    for (let i = 0; i < 150; i++) h = history(h, { type: "set", edits: editCells(NO_EDITS, [{ line: 2, col: "f0", text: String(i) }]) });
    expect(h.past).toHaveLength(100);
  });

  it("starts again from a draft, or from nothing", () => {
    expect(history(history(START, { type: "set", edits: a }), { type: "reset", edits: b })).toEqual({ now: b, past: [], future: [] });
    expect(history(START, { type: "reset" }).now).toBe(NO_EDITS);
  });
});
