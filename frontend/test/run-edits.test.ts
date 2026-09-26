import { describe, it, expect } from "vitest";
import { parseCsv } from "@ledgerline/core";
import {
  NO_EDITS, applyEdits, withEdits, applyGroup, undoGroup, undoLine, leaveOut, putBack,
  changeCounts, changesText, correctionReminder,
} from "@/lib/run-edits";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const SRC = parseCsv(`invoiceId,token,to,amount\nINV-1,USD,${A},10\nINV-2,USDC,nope,5\nINV-3,USD,${A},1`);

describe("applyEdits", () => {
  it("returns the rows as read when nothing is edited", () => {
    expect(applyEdits(SRC.rows, NO_EDITS)).toEqual(SRC.rows);
  });

  it("puts an edited field over the row as read, trimmed, and leaves the source alone", () => {
    const rows = applyEdits(SRC.rows, withEdits(NO_EDITS, [{ line: 2, field: "token", text: " USDC " }]));
    expect(rows[0]!.tokenSymbol).toBe("USDC");
    expect(SRC.rows[0]!.tokenSymbol).toBe("USD");
  });

  it("drops a left-out line, and brings it back", () => {
    const out = leaveOut(NO_EDITS, 3);
    expect(applyEdits(SRC.rows, out).map((r) => r.line)).toEqual([2, 4]);
    expect(applyEdits(SRC.rows, putBack(out, 3)).map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("reads an unreadable line from what was typed alone", () => {
    const src = parseCsv(`invoiceId,token,to,amount\nINV-1,USDC`);
    const rows = applyEdits(src.rows, withEdits(NO_EDITS, [{ line: 2, field: "invoiceId", text: "INV-9" }]));
    expect(rows[0]!.unreadable).toBeUndefined();
    expect(rows[0]!.invoiceId).toBe("INV-9");
    expect(rows[0]!.tokenSymbol).toBe("");
  });
});

describe("groups and undo", () => {
  const action = {
    edits: [{ line: 2, field: "token" as const, text: "USDC" }, { line: 4, field: "token" as const, text: "USDC" }],
    applied: { key: "token:usd", field: "token" as const, lines: [2, 4], title: "Token changed to USDC on 2 lines." },
  };

  it("applies a group in one step and undoes it in one step", () => {
    const e = applyGroup(NO_EDITS, action);
    expect(e.groups).toEqual([action.applied]);
    expect(applyEdits(SRC.rows, e).map((r) => r.tokenSymbol)).toEqual(["USDC", "USDC", "USDC"]);
    expect(undoGroup(e, "token:usd")).toEqual({ cells: {}, removed: [], groups: [] });
  });

  it("undoes a group without touching another edit on the same line", () => {
    const e = withEdits(applyGroup(NO_EDITS, action), [{ line: 2, field: "amount", text: "11" }]);
    expect(undoGroup(e, "token:usd").cells).toEqual({ 2: { amount: "11" } });
  });

  it("undoes one line, taking it out of any group it was in", () => {
    const e = undoLine(applyGroup(NO_EDITS, action), 2);
    expect(e.cells).toEqual({ 4: { token: "USDC" } });
    expect(e.groups[0]!.lines).toEqual([4]);
    expect(undoLine(e, 4).groups).toEqual([]);
  });
});

describe("what changed, in words", () => {
  it("counts edited lines apart from left-out ones", () => {
    const e = leaveOut(withEdits(NO_EDITS, [
      { line: 2, field: "token", text: "USDC" }, { line: 2, field: "amount", text: "1" },
      { line: 3, field: "to", text: A },
    ]), 3);
    expect(changeCounts(e)).toEqual({ edited: 1, leftOut: 1 });
  });

  it("says nothing when nothing changed", () => {
    expect(changesText({ edited: 0, leftOut: 0 })).toBeUndefined();
    expect(correctionReminder({ edited: 0, leftOut: 0 })).toBeUndefined();
  });

  it("names the changes for the side summary", () => {
    expect(changesText({ edited: 1, leftOut: 0 })).toBe("1 line edited here");
    expect(changesText({ edited: 3, leftOut: 1 })).toBe("3 lines edited here · 1 left out");
    expect(changesText({ edited: 0, leftOut: 2 })).toBe("2 left out");
  });

  it("reminds the payer to update the spreadsheet", () => {
    expect(correctionReminder({ edited: 3, leftOut: 1 })).toBe(
      "You edited 3 lines and left 1 out of this run. Download the corrected file to update your spreadsheet.",
    );
    expect(correctionReminder({ edited: 1, leftOut: 0 })).toBe(
      "You edited 1 line. Download the corrected file to update your spreadsheet.",
    );
    expect(correctionReminder({ edited: 0, leftOut: 2 })).toBe(
      "You left 2 lines out of this run. Download the corrected file to update your spreadsheet.",
    );
  });
});
