import { describe, it, expect } from "vitest";
import { parseCsv, tokensForChain } from "@ledgerline/core";
import { checkRunFile, checkRows, reviewView, ALL_LEFT_OUT } from "@/lib/review-view";
import { NO_EDITS, withEdits, leaveOut } from "@/lib/run-edits";

const TOKENS = tokensForChain(5042002);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8,
};
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

// The upload step's own sequence, so this cannot drift from what it runs.
const viewOf = (text: string) => reviewView(checkRunFile(text, TOKENS, DECIMALS));

describe("reviewView", () => {
  it("lists every problem in line order, naming the line and its invoice", () => {
    const v = viewOf(`invoiceId,token,to,amount
INV-1,USDC,${A},10
INV-2,USDT,${A},10
INV-1,USDC,${A},3
INV-4,EURC,${A},"1,000"`);
    expect(v.items.map((i) => i.where)).toEqual([
      "Line 3 · INV-2", "Line 4 · INV-1", "Line 4 · INV-1", "Line 5 · INV-4",
    ]);
    expect(v.items.map((i) => i.level)).toEqual(["error", "error", "warning", "error"]);
    expect(v.blocking).toBe(3);
    expect(v.title).toBe("Fix these lines");
    expect(v.summary).toBe("3 problems stop this run from being paid. Fix them in the file and choose it again.");
    expect(v.fixFirst).toBe("Fix 3 problems first");
  });

  it("names a wrong header once, with no false \"no payments\" before it", () => {
    const v = viewOf(`Invoice ID,Token,Recipient,Salary\na,b,c,1`);
    expect(v.items.map((i) => i.where)).toEqual(["Line 1"]);
    expect(v.fixFirst).toBe("Fix 1 problem first");
  });

  it("counts a file whose every row is refused by its rows alone", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},0\nINV-2,USDT,${A},1`);
    expect(v.items.map((i) => i.where)).toEqual(["Line 2 · INV-1", "Line 3 · INV-2"]);
    expect(v.fixFirst).toBe("Fix 2 problems first");
  });

  it("still says so when the file holds no rows at all", () => {
    const v = viewOf(`invoiceId,token,to,amount\n`);
    expect(v.items.map((i) => [i.where, i.message])).toEqual([["This file", "This file has no payments in it."]]);
  });

  it("says one problem in the singular", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\nINV-2,EURC,${A},0`);
    expect(v.summary).toBe("1 problem stops this run from being paid. Fix it in the file and choose it again.");
    expect(v.fixFirst).toBe("Fix 1 problem first");
  });

  it("with only warnings, asks for a second look and blocks nothing", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\nINV-2,USDC,${A},2`);
    expect(v.blocking).toBe(0);
    expect(v.title).toBe("Check these lines");
    expect(v.fixFirst).toBeUndefined();
  });

  it("asks for a second look at a semicolon amount that could mean a thousand", () => {
    const v = viewOf(`invoiceId;token;to;amount\nINV-1;USDC;${A};1,000\nINV-2;EURC;${A};2,5`);
    expect(v.items.map((i) => [i.where, i.level])).toEqual([["Line 2 · INV-1", "warning"]]);
    expect(v.items[0]!.message).toMatch(/read as 1, not 1000/);
    expect(v.blocking).toBe(0);
    expect(v.title).toBe("Check these lines");
  });

  it("is empty for a clean file", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`);
    expect(v).toEqual({ items: [], blocking: 0 });
  });
});

describe("checkRows", () => {
  const check = (text: string, edits = NO_EDITS) => checkRows(parseCsv(text), edits, TOKENS, DECIMALS);

  it("gives every row problem its line, field and level, in line order", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USD,${A},1\nINV-2,USDC,${A},1\nINV-3,USDC,${A},2`);
    expect(c.problems.map((p) => [p.line, p.field, p.level])).toEqual([
      [2, "token", "error"], [4, undefined, "warning"],
    ]);
    expect(c.fileProblems).toEqual([]);
  });

  it("keeps the file's own problems apart from the rows'", () => {
    expect(check(`id,coin\n1,2`).fileProblems[0]).toMatch(/^The first line must name the columns/);
    expect(check(`invoiceId,token,to,amount\n`).fileProblems).toEqual(["This file has no payments in it."]);
  });

  it("re-reads a line from its edit, through the same rules", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    const c = check(text, withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]));
    expect(c.problems).toEqual([]);
    expect(c.rows.map((r) => r.line)).toEqual([2]);
  });

  it("refuses 0,10 typed into a comma file, and reads 0.10 typed into a semicolon file", () => {
    const comma = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},x`,
      withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0,10" }]));
    expect(comma.rows).toEqual([]);
    expect(comma.problems[0]).toMatchObject({ line: 2, field: "amount", level: "error" });
    const semi = check(`invoiceId;token;to;amount\nINV-1;USDC;${A};x`,
      withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0.10" }]));
    expect(semi.rows[0]!.amount).toBe(100_000n);
  });

  it("says every line is left out, not that the file is empty", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, leaveOut(NO_EDITS, 2));
    expect(c.fileProblems).toEqual([ALL_LEFT_OUT]);
    expect(ALL_LEFT_OUT).toBe("Every line is left out of this run. Put one back to pay it.");
  });
});
