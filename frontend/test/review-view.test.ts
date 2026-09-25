import { describe, it, expect } from "vitest";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import { reviewView } from "@/lib/review-view";

const TOKENS = tokensForChain(5042002);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8,
};
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

function viewOf(text: string) {
  const { rows, issues } = parseCsv(text);
  const resolved = resolveRows(rows, TOKENS, DECIMALS);
  const refused = [...issues, ...resolved.issues];
  const { errors, warnings } = validateRun(resolved.items, refused.length);
  return reviewView({ issues: refused, errors, warnings, parsed: rows });
}

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

  it("is empty for a clean file", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`);
    expect(v).toEqual({ items: [], blocking: 0 });
  });
});
