import { describe, it, expect } from "vitest";
import { parseCsv, readLines, readSheet, tokensForChain, type ColumnId, type ResolvedRow } from "@ledgerline/core";
import { correctedCsv, correctedFile, headerName } from "@/lib/corrected-file";
import {
  NO_EDITS, addColumn, addLine, applyBatch, cellText, deleteLine, editCells, leaveOut, nextBatchId,
  numberInvoices, replaceInColumn, setRole, structureOf, useAsHeader, type SheetEdits,
} from "@/lib/sheet-edits";
import { A, B, C, D, PERSONAS } from "./fixtures/personas";
import { checkRows } from "@/lib/review-view";
import { PASTED_ROWS } from "@/lib/run-file";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
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

const payable = (rows: ResolvedRow[]) => rows.map(({ invoiceId, token, to, amount }) => ({ invoiceId, token, to, amount }));

/** The run on screen, the corrected file, and that file read back with no edits. */
function roundTrip(text: string, edits: SheetEdits) {
  const lines = readLines(text);
  const sheet = readSheet(lines, structureOf(edits));
  const onScreen = checkRows(sheet, edits, TOKENS, DECIMALS);
  const written = correctedCsv(lines, sheet, edits);
  return { onScreen, written, reread: checkRows(parseCsv(written), NO_EDITS, TOKENS, DECIMALS) };
}

/** One column's cells, as the grid shows them, for a find and replace. */
function columnValues(text: string, e: SheetEdits, col: ColumnId) {
  const sheet = readSheet(readLines(text), structureOf(e));
  return sheet.rows.map((r) => ({ line: r.line, text: cellText(e, r, r.line, col) }));
}

const rolesOf = (text: string, e: SheetEdits) => readSheet(readLines(text), structureOf(e)).roles;

describe("headerName", () => {
  it("keeps a name that says its role, names a role the name does not say, and marks a not-used name that says one", () => {
    expect(headerName("Wallet Address", "to")).toBe("Wallet Address");
    expect(headerName("Amount (USDC)", "amount")).toBe("amount");
    expect(headerName("Currency", "unused")).toBe("Currency (not used)");
    expect(headerName("Notes", "unused")).toBe("Notes");
  });
});

describe("the corrected file, for the files payers bring", () => {
  it("P1, Google Sheets: roles, a token column, $ removed, marks read, the Total line deleted", () => {
    const t = PERSONAS.gsheets;
    let e = setRole(NO_EDITS, rolesOf(t, NO_EDITS), "f3", "amount");
    e = setRole(e, rolesOf(t, e), "f4", "invoiceId");
    e = addColumn(e, "token", "USDC").edits;
    e = deleteLine(e, 6);
    e = applyBatch(e, { id: nextBatchId(e, "replace"), kind: "column", title: '"$" → "" in Amount (USDC)' },
      replaceInColumn(columnValues(t, e, "f3"), "f3", "$", ""));
    e = editCells(e, [{ line: 2, col: "f3", text: "1250.00" }, { line: 4, col: "f3", text: "2400.50" }]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.fileProblems).toEqual([]);
    expect(onScreen.problems.filter((p) => p.level === "error")).toEqual([]);
    expect(onScreen.rows).toHaveLength(3);
    expect(written.split("\n")[0]).toBe("Name,Email,Wallet Address,amount,invoiceId,Notes,token");
    expect(written).toContain(`Alice Nguyen,alice@example.com,${A},1250.00,INV-2026-09-01,"Design, Sept",USDC\n`);
    expect(written).toContain("\n,,,,,\n");
    expect(written).not.toContain("Total");
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P2, Excel in German: roles, EUR to EURC on every line, thousands marks read", () => {
    const t = PERSONAS.excelDe;
    let e = setRole(NO_EDITS, rolesOf(t, NO_EDITS), "f2", "token");
    e = setRole(e, rolesOf(t, e), "f3", "amount");
    e = setRole(e, rolesOf(t, e), "f4", "invoiceId");
    e = applyBatch(e, { id: "token:eur", kind: "group", title: "Token changed to EURC on 3 lines." },
      [2, 3, 4].map((line) => ({ line, col: "f2" as const, text: "EURC" })));
    e = editCells(e, [{ line: 2, col: "f3", text: "1234,56" }, { line: 4, col: "f3", text: "2000,00" }]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.problems.filter((p) => p.level === "error")).toEqual([]);
    expect(onScreen.rows).toHaveLength(3);
    expect(written.startsWith("﻿Empfänger;Wallet;token;amount;invoiceId\r\n")).toBe(true);
    expect(written).toContain(`Anna Schmidt;${A};EURC;1234,56;RE-0917\r\n`);
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P3, Numbers: the title line is not written, and the rest is kept byte for byte", () => {
    const { onScreen, written, reread } = roundTrip(PERSONAS.numbers, useAsHeader(NO_EDITS, 2));
    expect(onScreen.rows).toHaveLength(3);
    expect(written).toBe(PERSONAS.numbers.slice("ledgerline-sample\r\n".length));
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P4, next month: an amount changed, the month moved, one person gone, one joined", () => {
    const t = PERSONAS.nextMonth;
    let e = editCells(NO_EDITS, [{ line: 2, col: "f3", text: "1300" }]);
    e = applyBatch(e, { id: nextBatchId(e, "replace"), kind: "column", title: '"2026-09" → "2026-10" in invoiceId' },
      replaceInColumn(columnValues(t, e, "f0"), "f0", "2026-09", "2026-10"));
    e = deleteLine(e, 3);
    const added = addLine(e, readLines(t).length);
    e = editCells(added.edits, [
      { line: added.line, col: "f0", text: "PAY-2026-10-04" }, { line: added.line, col: "f1", text: "USDC" },
      { line: added.line, col: "f2", text: D }, { line: added.line, col: "f3", text: "640" },
    ]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["PAY-2026-10-01", "PAY-2026-10-03", "PAY-2026-10-04"]);
    expect(written).toBe(
      `invoiceId,token,to,amount\nPAY-2026-10-01,USDC,${A},1300\nPAY-2026-10-03,EURC,${C},800\nPAY-2026-10-04,USDC,${D},640\n`,
    );
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P5, a platform report: header on line 5, the wallet column named, bank and USDT lines left out", () => {
    const t = PERSONAS.platform;
    let e = useAsHeader(NO_EDITS, 5);
    e = setRole(e, rolesOf(t, e), "f5", "to");
    e = leaveOut(leaveOut(e, 7), 8);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.fileProblems).toEqual([]);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["INV-771", "INV-774"]);
    expect(written.split("\n")[0]).toBe("Contractor,Invoice ID,Payment method,Currency,Amount,to");
    expect(written).toContain("Evan Ho,INV-772,Bank transfer,USD,2100.00,\n");
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P6, two columns: a token on every line and numbered invoices", () => {
    const t = PERSONAS.twoColumns;
    const e = numberInvoices(addColumn(NO_EDITS, "token", "USDC").edits, [2, 3, 4], "October");
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["October-1", "October-2", "October-3"]);
    expect(written).toBe(
      `wallet,amount,token,invoiceId\n${A},100,USDC,October-1\n${B},250,USDC,October-2\n${C},75,USDC,October-3\n`,
    );
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("quotes a typed cell holding the file's delimiter or a quote, in a ; file, and reads it back", () => {
    const t = `invoiceId;token;to;amount;Note\nINV-1;USDC;${A};1;x`;
    const out = fix(t, editCells(NO_EDITS, [{ line: 2, col: "f4", text: 'Design; "Sept"' }]));
    expect(out).toBe(`invoiceId;token;to;amount;Note\nINV-1;USDC;${A};1;"Design; ""Sept"""`);
    expect(parseCsv(out).rows[0]!.cells[4]).toBe('Design; "Sept"');
  });

  it("gives a left-out line a new column's value, so it reads back with the header's columns", () => {
    const t = `wallet,amount,invoiceId\n${A},100,I-1\n${B},250,I-2\n`;
    const e = leaveOut(addColumn(NO_EDITS, "token", "USDC").edits, 3);
    expect(fix(t, e)).toBe(`wallet,amount,invoiceId,token\n${A},100,I-1,USDC\n${B},250,I-2,USDC\n`);
  });

  it("breaks the last line before a new line when the file had no final break", () => {
    const t = `invoiceId,token,to,amount\nINV-1,USDC,${A},1`;
    const { edits, line } = addLine(NO_EDITS, readLines(t).length);
    const e = editCells(edits, [
      { line, col: "f0", text: "INV-2" }, { line, col: "f1", text: "EURC" }, { line, col: "f2", text: B }, { line, col: "f3", text: "2" },
    ]);
    expect(fix(t, e)).toBe(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\nINV-2,EURC,${B},2\n`);
  });
});
