import { describe, it, expect } from "vitest";
import { readLines, readSheet } from "@ledgerline/core";
import {
  NO_EDITS, structureOf, applySheetEdits, editCells, applyBatch, undoBatch, undoCell, undoLine,
  leaveOut, putBack, deleteLine, restoreLine, addLine, setRole, addColumn, dropColumn, numberInvoices,
  replaceInColumn, useAsHeader, droppedByHeader, changeCounts, changeTotal, fileChanged, changesText,
  correctionReminder, headerWarning, type SheetEdits,
} from "@/lib/sheet-edits";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const LINES = readLines(`invoiceId,token,to,amount,Note\nINV-1,USD,${A},10,a\nINV-2,USDC,nope,5,b\nINV-3,USD,${A},1,c`);
const sheet = (e: SheetEdits = NO_EDITS) => readSheet(LINES, structureOf(e));
const rows = (e: SheetEdits) => applySheetEdits(sheet(e), e);

describe("applySheetEdits", () => {
  it("returns the rows as read when nothing is edited", () => {
    expect(rows(NO_EDITS)).toEqual(sheet().rows);
  });

  it("reads a typed cell over the cell as read, trimmed, and leaves the file alone", () => {
    const e = editCells(NO_EDITS, [{ line: 2, col: "f1", text: " USDC " }]);
    expect(rows(e)[0]!.tokenSymbol).toBe("USDC");
    expect(sheet(e).rows[0]!.tokenSymbol).toBe("USD");
  });

  it("drops deleted and left-out lines, and brings them back", () => {
    const e = leaveOut(deleteLine(NO_EDITS, 3), 4);
    expect(rows(e).map((r) => r.line)).toEqual([2]);
    expect(rows(putBack(restoreLine(e, 3), 4)).map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("reads an unreadable line from what was typed alone", () => {
    const lines = readLines(`invoiceId,token,to,amount\nINV-1,USDC`);
    const e = editCells(NO_EDITS, [{ line: 2, col: "f0", text: "INV-9" }]);
    const [row] = applySheetEdits(readSheet(lines), e);
    expect(row).toMatchObject({ line: 2, invoiceId: "INV-9", tokenSymbol: "", to: "", amount: "" });
    expect(row!.unreadable).toBeUndefined();
  });

  it("reads a new line from its typed cells, numbered after the file's last line", () => {
    const { edits, line } = addLine(NO_EDITS, LINES.length);
    expect(line).toBe(5);
    const e = editCells(edits, [
      { line, col: "f0", text: "INV-4" }, { line, col: "f1", text: "EURC" },
      { line, col: "f2", text: A }, { line, col: "f3", text: "7" },
    ]);
    expect(rows(e).at(-1)).toEqual({ line: 5, invoiceId: "INV-4", tokenSymbol: "EURC", to: A, amount: "7", cells: [] });
    expect(addLine(e, LINES.length).line).toBe(6);
  });

  it("reads a new column's fill on every line, and a typed cell over it", () => {
    const lines = readLines(`wallet,amount,invoiceId\n${A},100,I-1\n${A},250,I-2`);
    const { edits, col } = addColumn(NO_EDITS, "token", "USDC");
    const e = editCells(edits, [{ line: 3, col, text: "EURC" }]);
    expect(applySheetEdits(readSheet(lines, structureOf(e)), e).map((r) => r.tokenSymbol)).toEqual(["USDC", "EURC"]);
  });
});

describe("batches and undo", () => {
  const group = { id: "token:usd", kind: "group" as const, title: "Token changed to USDC on 2 lines." };
  const changes = [{ line: 2, col: "f1" as const, text: "USDC" }, { line: 4, col: "f1" as const, text: "USDC" }];

  it("applies a batch in one step and undoes it in one step", () => {
    const e = applyBatch(NO_EDITS, group, changes);
    expect(rows(e).map((r) => r.tokenSymbol)).toEqual(["USDC", "USDC", "USDC"]);
    expect(undoBatch(e, "token:usd")).toEqual(NO_EDITS);
  });

  it("undoes a batch without touching another cell on the same line", () => {
    const e = editCells(applyBatch(NO_EDITS, group, changes), [{ line: 2, col: "f3", text: "11" }]);
    expect(undoBatch(e, "token:usd").cells).toEqual({ 2: { f3: "11" } });
  });

  it("undoes one cell, taking it out of its batch", () => {
    const e = undoCell(applyBatch(NO_EDITS, group, changes), 2, "f1");
    expect(e.cells).toEqual({ 4: { f1: "USDC" } });
    expect(e.batches[0]!.cells).toEqual([[4, "f1"]]);
    expect(undoCell(e, 4, "f1").batches).toEqual([]);
  });

  it("undoes a line, taking it out of a group but leaving a numbering to its own undo", () => {
    let e = applyBatch(NO_EDITS, group, changes);
    e = numberInvoices(e, [2, 3, 4], "Payroll");
    e = undoLine(e, 2);
    expect(e.cells[2]).toEqual({ n1: "Payroll-1" });
    expect(e.batches.map((b) => b.id)).toEqual(["token:usd", "number:n1"]);
    expect(e.batches[0]!.cells).toEqual([[4, "f1"]]);
  });
});

describe("lines, columns and the header", () => {
  it("deletes a new line outright, and marks a file line deleted", () => {
    const { edits, line } = addLine(NO_EDITS, LINES.length);
    expect(deleteLine(editCells(edits, [{ line, col: "f0", text: "X" }]), line)).toEqual(NO_EDITS);
    expect(deleteLine(NO_EDITS, 3).deleted).toEqual([3]);
  });

  it("takes a deleted line off the left-out list", () => {
    expect(deleteLine(leaveOut(NO_EDITS, 3), 3)).toMatchObject({ deleted: [3], leftOut: [] });
  });

  it("moves a role to a column, marking the column that held it not used", () => {
    const e = setRole(NO_EDITS, sheet().roles, "f4", "invoiceId");
    expect(e.roles).toEqual({ f4: "invoiceId", f0: "unused" });
    expect(sheet(e).columns?.invoiceId).toBe("f4");
  });

  it("gives a new column a role through the same move", () => {
    const { edits, col } = addColumn(NO_EDITS, "unused", "");
    const e = setRole(edits, sheet(edits).roles, col, "amount");
    expect(e.newColumns[0]!.role).toBe("amount");
    expect(e.roles).toEqual({ f3: "unused" });
  });

  it("drops a new column with its cells and its batch", () => {
    expect(dropColumn(numberInvoices(NO_EDITS, [2, 3], "P"), "n1")).toEqual(NO_EDITS);
  });

  it("numbers invoices on the lines given, in order, as one batch in a new column", () => {
    const e = numberInvoices(NO_EDITS, [2, 4, 7], "Oct");
    expect(e.newColumns).toEqual([{ id: "n1", name: "invoiceId", role: "invoiceId", fill: "" }]);
    expect(e.cells).toEqual({ 2: { n1: "Oct-1" }, 4: { n1: "Oct-2" }, 7: { n1: "Oct-3" } });
    expect(e.batches).toEqual([{
      id: "number:n1", kind: "column", title: "Invoices numbered Oct-1 to Oct-3",
      cells: [[2, "n1"], [4, "n1"], [7, "n1"]],
    }]);
  });

  it("replaces plain text in one column's cells, only where it occurs", () => {
    const values = [{ line: 2, text: "$1,250.00" }, { line: 3, text: "980" }, { line: 4, text: "$$5" }];
    expect(replaceInColumn(values, "f3", "$", "")).toEqual([
      { line: 2, col: "f3", text: "1,250.00" }, { line: 4, col: "f3", text: "5" },
    ]);
    expect(replaceInColumn(values, "f3", "", "x")).toEqual([]);
  });

  it("reads the table from another line, dropping what was keyed to the old header's columns", () => {
    let e = addColumn(NO_EDITS, "token", "USDC").edits;
    e = editCells(e, [{ line: 3, col: "f0", text: "X" }]);
    e = leaveOut(deleteLine(e, 4), 3);
    expect(droppedByHeader(e)).toBe(2);
    expect(useAsHeader(e, 2)).toEqual({ ...NO_EDITS, headerLine: 2, deleted: [4], leftOut: [3] });
  });
  it("warns how many changes a new header line drops", () => {
    expect(headerWarning(1)).toBe("The 1 change made under the current header's columns will be dropped.");
    expect(headerWarning(3)).toBe("The 3 changes made under the current header's columns will be dropped.");
  });
});

describe("what changed, in words", () => {
  it("counts cells, columns, lines added, deleted and left out", () => {
    let e = editCells(NO_EDITS, [
      { line: 2, col: "f1", text: "USDC" }, { line: 2, col: "f3", text: "1" }, { line: 3, col: "f2", text: A },
    ]);
    e = addColumn(e, "unused", "").edits;
    const added = addLine(e, LINES.length);
    e = editCells(added.edits, [{ line: added.line, col: "f0", text: "N" }]);
    e = deleteLine(leaveOut(e, 3), 4);
    const c = changeCounts(e);
    expect(c).toEqual({ cells: 2, columns: 1, added: 1, deleted: 1, leftOut: 1 });
    expect(changeTotal(c)).toBe(6);
    expect(fileChanged(c)).toBe(true);
    expect(fileChanged(changeCounts(leaveOut(NO_EDITS, 2)))).toBe(false);
  });

  it("says nothing when nothing changed", () => {
    expect(changesText(changeCounts(NO_EDITS))).toBeUndefined();
    expect(correctionReminder(changeCounts(NO_EDITS))).toBeUndefined();
  });

  it("names the changes for the summary, and reminds the payer to update the spreadsheet", () => {
    const c = { cells: 6, columns: 2, added: 1, deleted: 1, leftOut: 1 };
    expect(changesText(c)).toBe("6 cells · 2 columns changed · 1 line added · 1 deleted · 1 left out");
    expect(changesText({ cells: 1, columns: 0, added: 0, deleted: 0, leftOut: 0, header: 5 })).toBe("1 cell · header on line 5");
    expect(correctionReminder(c)).toBe(
      "Changed here: 6 cells · 2 columns changed · 1 line added · 1 deleted · 1 left out. Download the corrected file to update your spreadsheet.",
    );
  });
});
