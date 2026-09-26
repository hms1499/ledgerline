import { describe, it, expect } from "vitest";
import { readLines, readSheet } from "@ledgerline/core";
import { changesView } from "@/lib/changes-view";
import {
  NO_EDITS, addColumn, addLine, applyBatch, deleteLine, editCells, leaveOut, setRole, structureOf, useAsHeader,
  type SheetEdits,
} from "@/lib/sheet-edits";
import { A, PERSONAS } from "./fixtures/personas";

const view = (text: string, edits: SheetEdits) => {
  const lines = readLines(text);
  return changesView({ lines, sheet: readSheet(lines, structureOf(edits)), edits });
};

describe("changesView", () => {
  it("lists nothing when nothing changed", () => {
    expect(view(PERSONAS.nextMonth, NO_EDITS)).toEqual({ entries: [] });
  });

  it("names a typed cell by line and column, before and after, an address in full", () => {
    const t = `invoiceId,token,to,amount\nINV-1,USDC,vitalik.eth,1`;
    const e = editCells(NO_EDITS, [{ line: 2, col: "f2", text: A.toLowerCase() }, { line: 2, col: "f3", text: "2" }]);
    const v = view(t, e);
    expect(v.entries.map((x) => x.text)).toEqual([`Line 2 · to · vitalik.eth → ${A}`, "Line 2 · amount · 1 → 2"]);
    expect(v.entries[0]!.undo.cells).toEqual({ 2: { f3: "2" } });
  });

  it("lists the header, roles, columns, batches, and lines added, deleted and left out, each with its undo", () => {
    const t = PERSONAS.platform;
    let e = useAsHeader(NO_EDITS, 5);
    e = setRole(e, readSheet(readLines(t), structureOf(e)).roles, "f5", "to");
    e = addColumn(e, "token", "USDC").edits;
    e = applyBatch(e, { id: "replace:1", kind: "column", title: '"Crypto" → "Onchain" in Payment method' },
      [{ line: 6, col: "f2", text: "Onchain" }]);
    const added = addLine(e, readLines(t).length);
    e = deleteLine(leaveOut(added.edits, 7), 9);
    const v = view(t, e);
    expect(v.entries.map((x) => x.text)).toEqual([
      "Header · line 5",
      "Crypto wallet · to",
      "Column token added · USDC on every line",
      '"Crypto" → "Onchain" in Payment method',
      `Line ${added.line} · added`,
      "Line 9 · deleted",
      "Line 7 · left out of this run",
    ]);
    expect(v.note).toBe("Lines 1–4 are above the header and are not in the corrected file.");
    expect(v.entries.find((x) => x.id === "deleted:9")!.undo.deleted).toEqual([]);
    expect(v.entries.find((x) => x.id === "role:f5")!.undo.roles).toEqual({});
  });

  it("says a single line above the header is not in the corrected file", () => {
    expect(view(PERSONAS.numbers, useAsHeader(NO_EDITS, 2)).note)
      .toBe("Line 1 is above the header and is not in the corrected file.");
  });
});
