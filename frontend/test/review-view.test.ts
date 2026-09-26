import { describe, it, expect } from "vitest";
import { readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { checkRows, ALL_LEFT_OUT } from "@/lib/review-view";
import { NO_EDITS, editCells, leaveOut, deleteLine, structureOf, type SheetEdits } from "@/lib/sheet-edits";

const TOKENS = tokensForChain(5042002);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8,
};
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("checkRows", () => {
  const check = (text: string, edits: SheetEdits = NO_EDITS) =>
    checkRows(readSheet(readLines(text), structureOf(edits)), edits, TOKENS, DECIMALS);

  it("gives every row problem its line, field and level, in line order", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USD,${A},1\nINV-2,USDC,${A},1\nINV-3,USDC,${A},2`);
    expect(c.problems.map((p) => [p.line, p.field, p.level])).toEqual([
      [2, "token", "error"], [4, undefined, "warning"],
    ]);
    expect(c.fileProblems).toEqual([]);
  });

  it("keeps the file's own problems apart from the rows'", () => {
    expect(check(`id,coin\n1,2`).fileProblems[0]).toMatch(/^No column is the /);
    expect(check(`invoiceId,token,to,amount\n`).fileProblems).toEqual(["This file has no payments in it."]);
  });

  it("re-reads a line from its typed cell, through the same rules", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USD,${A},1`, editCells(NO_EDITS, [{ line: 2, col: "f1", text: "USDC" }]));
    expect(c.problems).toEqual([]);
    expect(c.rows.map((r) => r.line)).toEqual([2]);
  });

  it("refuses 0,10 typed into a comma file, and reads 0.10 typed into a semicolon file", () => {
    const comma = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},x`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0,10" }]));
    expect(comma.rows).toEqual([]);
    expect(comma.problems[0]).toMatchObject({ line: 2, field: "amount", level: "error" });
    const semi = check(`invoiceId;token;to;amount\nINV-1;USDC;${A};x`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0.10" }]));
    expect(semi.rows[0]!.amount).toBe(100_000n);
  });

  it("says every line is left out, not that the file is empty", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, leaveOut(NO_EDITS, 2));
    expect(c.fileProblems).toEqual([ALL_LEFT_OUT]);
    expect(ALL_LEFT_OUT).toBe("Every line is left out of this run. Put one back to pay it.");
  });

  it("says a file whose every line is deleted has no payments", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, deleteLine(NO_EDITS, 2));
    expect(c.fileProblems).toEqual(["This file has no payments in it."]);
  });
});
