import { describe, it, expect } from "vitest";
import { readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { sheetGrid, templateRule } from "@/lib/sheet-grid";
import { checkRows } from "@/lib/review-view";
import {
  NO_EDITS, addColumn, addLine, deleteLine, editCells, leaveOut, structureOf, useAsHeader, type SheetEdits,
} from "@/lib/sheet-edits";
import { A, PERSONAS } from "./fixtures/personas";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };

function grid(text: string, edits: SheetEdits = NO_EDITS) {
  const lines = readLines(text);
  const sheet = readSheet(lines, structureOf(edits));
  return sheetGrid({ lines, sheet, edits, checked: checkRows(sheet, edits, TOKENS, DECIMALS), tokens: TOKENS });
}

describe("sheetGrid", () => {
  it("shows a file whose header names nothing we pay: its column not used, four ghosts, the lines as split", () => {
    const g = grid(PERSONAS.numbers);
    expect(g.columns).toEqual([{ id: "f0", name: "ledgerline-sample", role: "unused", isNew: false }]);
    expect(g.ghosts.map((x) => x.role)).toEqual(["invoiceId", "token", "to", "amount"]);
    expect(g.rows.map((r) => r.cells[0]!.text)).toEqual([
      "invoiceId;token;to;amount", `INV-US-001;USDC;${A};0.10`, `INV-EU-002;EURC;${A};0.10`, `INV-BTC-003;cirBTC;${A};0.000001`,
    ]);
  });

  it("reads the table from the chosen header, and lists the lines above it", () => {
    const g = grid(PERSONAS.numbers, useAsHeader(NO_EDITS, 2));
    expect(g.above).toEqual([{ line: 1, text: "ledgerline-sample" }]);
    expect(g.columns.map((c) => [c.name, c.role])).toEqual([
      ["invoiceId", "invoiceId"], ["token", "token"], ["to", "to"], ["amount", "amount"],
    ]);
    expect(g.ghosts).toEqual([]);
    expect(g.rows.map((r) => r.label)).toEqual(["3", "4", "5"]);
  });

  it("marks a typed cell with what it was, and a problem cell with its message", () => {
    const g = grid(`invoiceId,token,to,amount\nINV-1,USD,${A},1`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "2" }]));
    const [inv, tok, , amt] = g.rows[0]!.cells;
    expect(amt).toMatchObject({ id: "cell-2-f3", text: "2", edited: true, was: "1" });
    expect(tok!.problem).toMatch(/"USD" is not a token/);
    expect(inv!.edited).toBe(false);
    expect(inv!.was).toBeUndefined();
  });

  it("shows a ghost's rule, a new column's fill, and new, left-out and deleted lines in place", () => {
    const t = PERSONAS.twoColumns;
    let e = addColumn(NO_EDITS, "token", "USDC").edits;
    e = leaveOut(deleteLine(e, 3), 4);
    const { edits, line } = addLine(e, readLines(t).length);
    const g = grid(t, edits);
    expect(g.ghosts).toEqual([{ role: "invoiceId", rule: "Every line needs its own reference." }]);
    expect(g.columns.at(-1)).toEqual({ id: "n1", name: "token", role: "token", isNew: true });
    expect(g.rows.map((r) => [r.label, r.state])).toEqual([["2", "row"], ["3", "deleted"], ["4", "left-out"], [`${line} new`, "row"]]);
    expect(g.rows[0]!.cells.at(-1)!.text).toBe("USDC");
    expect(g.rows.at(-1)!.cells.map((c) => c.text)).toEqual(["", "", "USDC"]);
  });

  it("says why a line could not be read, and shows it as written over empty cells", () => {
    const g = grid(`invoiceId,token,to,amount\nINV-1,USDC`);
    expect(g.rows[0]).toMatchObject({ raw: "INV-1,USDC", message: expect.stringMatching(/^This line has 2 values/) });
    expect(g.rows[0]!.cells.map((c) => c.text)).toEqual(["", "", "", ""]);
  });

  it("skips blank lines and lines of empty cells", () => {
    expect(grid(PERSONAS.gsheets).rows.map((r) => r.line)).toEqual([2, 3, 4, 6]);
  });
});

describe("templateRule", () => {
  it("says what the template asks of each column, in the file's own decimal mark", () => {
    expect(templateRule("amount", ";", ["USDC"])).toBe("As on an invoice: 1250,50.");
    expect(templateRule("amount", ",", ["USDC"])).toBe("As on an invoice: 1250.50.");
    expect(templateRule("token", ",", ["USDC", "EURC", "cirBTC"])).toBe("One of USDC, EURC, cirBTC.");
    expect(templateRule("to", ",", [])).toBe("A wallet address: 0x and 40 letters and digits.");
  });
});
