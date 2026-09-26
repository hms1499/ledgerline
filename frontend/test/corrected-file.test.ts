import { describe, it, expect } from "vitest";
import { parseCsv, readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { correctedCsv, correctedFile } from "@/lib/corrected-file";
import { NO_EDITS, deleteLine, editCells, leaveOut, structureOf, type SheetEdits } from "@/lib/sheet-edits";
import { checkRows } from "@/lib/review-view";
import { PASTED_ROWS } from "@/lib/run-file";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const fix = (text: string, edits: SheetEdits) => {
  const lines = readLines(text);
  return correctedCsv(lines, readSheet(lines, structureOf(edits)), edits);
};
const file = (text: string, sourceName: string) =>
  correctedFile({ lines: readLines(text), sheet: parseCsv(text), edits: NO_EDITS, sourceName });

describe("correctedCsv", () => {
  it("gives back the file byte for byte when nothing is edited", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\n"Nguyen, An",INV-1,USDC,${A},1\r\n`;
    expect(fix(text, NO_EDITS)).toBe(text);
  });

  it("rewrites only the edited line, keeping the BOM, the line endings and the extra columns", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USD,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`;
    const out = fix(text, editCells(NO_EDITS, [{ line: 2, col: "f2", text: "USDC" }]));
    expect(out).toBe(`﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USDC,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`);
  });

  it("quotes an edited value that holds the delimiter or a quote, and it reads back the same", () => {
    const text = `invoiceId,token,to,amount\n,USDC,${A},1`;
    const out = fix(text, editCells(NO_EDITS, [{ line: 2, col: "f0", text: 'INV, "A"' }]));
    expect(out).toBe(`invoiceId,token,to,amount\n"INV, ""A""",USDC,${A},1`);
    expect(parseCsv(out).rows[0]!.invoiceId).toBe('INV, "A"');
  });

  it("writes an amount in the file's decimal mark, so a comma-decimal sheet stores a number", () => {
    const text = `invoiceId;token;to;amount\nINV-1;USDC;${A};1.000`;
    expect(fix(text, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0.10" }])))
      .toBe(`invoiceId;token;to;amount\nINV-1;USDC;${A};0,10`);
  });

  it("keeps a left-out line as it was, even with an edit typed into it first", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    expect(fix(text, leaveOut(editCells(NO_EDITS, [{ line: 2, col: "f1", text: "USDC" }]), 2))).toBe(text);
  });

  it("does not write a deleted line", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${A},1\nTotal,,,1\n`;
    expect(fix(text, deleteLine(NO_EDITS, 3))).toBe(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\n`);
  });

  it("writes an unreadable line out in the header's columns once it is typed in again", () => {
    const text = `invoiceId,token,to,amount,Note\nINV-1,USDC`;
    const e = editCells(NO_EDITS, [
      { line: 2, col: "f0", text: "INV-1" }, { line: 2, col: "f1", text: "USDC" },
      { line: 2, col: "f2", text: A }, { line: 2, col: "f3", text: "5" },
    ]);
    expect(fix(text, e)).toBe(`invoiceId,token,to,amount,Note\nINV-1,USDC,${A},5,`);
  });

  it("reads back to exactly the rows on screen", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},"1,250.50"\nINV-2,USDC,nope,2\nINV-3,EURC,${A},3\nINV-4,USDC,${A},x`;
    const lines = readLines(text);
    const e = leaveOut(editCells(NO_EDITS, [
      { line: 2, col: "f1", text: "USDC" }, { line: 2, col: "f3", text: "1250.50" },
      { line: 3, col: "f2", text: A.toLowerCase() },
    ]), 5);
    const sheet = readSheet(lines, structureOf(e));
    const onScreen = checkRows(sheet, e, TOKENS, DECIMALS).rows;
    const reread = checkRows(parseCsv(correctedCsv(lines, sheet, e)), NO_EDITS, TOKENS, DECIMALS).rows;
    expect(reread).toEqual(onScreen);
  });
});

describe("correctedFile", () => {
  it("names the file after the one chosen, in its own format", () => {
    const f = file(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, "September.csv");
    expect(f.name).toBe("September-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("names pasted rows as a tab-separated file", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, PASTED_ROWS);
    expect(f.name).toBe("pasted-rows-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });

  it("keeps a tab-separated .csv file as .csv, not .tsv", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, "X.csv");
    expect(f.name).toBe("X-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("keeps the original extension when .tsv, case-insensitive", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, "Payroll.TSV");
    expect(f.name).toBe("Payroll-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });

  it("names a file with no extension as .csv", () => {
    const f = file(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, "Payroll");
    expect(f.name).toBe("Payroll-corrected.csv");
    expect(f.type).toBe("text/csv");
  });
});
