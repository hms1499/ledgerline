import { describe, it, expect } from "vitest";
import { parseCsv, tokensForChain } from "@ledgerline/core";
import { correctedCsv, correctedFile } from "@/lib/corrected-file";
import { NO_EDITS, leaveOut, withEdits, type RunEdits } from "@/lib/run-edits";
import { checkRows } from "@/lib/review-view";
import { PASTED_ROWS } from "@/lib/run-file";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const fix = (text: string, edits: RunEdits) => correctedCsv(text, parseCsv(text), edits);

describe("correctedCsv", () => {
  it("gives back the file byte for byte when nothing is edited", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\n"Nguyen, An",INV-1,USDC,${A},1\r\n`;
    expect(fix(text, NO_EDITS)).toBe(text);
  });

  it("rewrites only the edited line, keeping the BOM, the line endings and the extra columns", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USD,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`;
    const out = fix(text, withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]));
    expect(out).toBe(`﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USDC,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`);
  });

  it("quotes an edited value that holds the delimiter or a quote, and it reads back the same", () => {
    const text = `invoiceId,token,to,amount\n,USDC,${A},1`;
    const out = fix(text, withEdits(NO_EDITS, [{ line: 2, field: "invoiceId", text: 'INV, "A"' }]));
    expect(out).toBe(`invoiceId,token,to,amount\n"INV, ""A""",USDC,${A},1`);
    expect(parseCsv(out).rows[0]!.invoiceId).toBe('INV, "A"');
  });

  it("writes an amount in the file's decimal mark, so a comma-decimal sheet stores a number", () => {
    const text = `invoiceId;token;to;amount\nINV-1;USDC;${A};1.000`;
    expect(fix(text, withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0.10" }])))
      .toBe(`invoiceId;token;to;amount\nINV-1;USDC;${A};0,10`);
  });

  it("keeps a left-out line as it was, even with an edit typed into it first", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    const e = leaveOut(withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]), 2);
    expect(fix(text, e)).toBe(text);
  });

  it("writes an unreadable line out in the header's columns once it is typed in again", () => {
    const text = `invoiceId,token,to,amount,Note\nINV-1,USDC`;
    const e = withEdits(NO_EDITS, [
      { line: 2, field: "invoiceId", text: "INV-1" }, { line: 2, field: "token", text: "USDC" },
      { line: 2, field: "to", text: A }, { line: 2, field: "amount", text: "5" },
    ]);
    expect(fix(text, e)).toBe(`invoiceId,token,to,amount,Note\nINV-1,USDC,${A},5,`);
  });

  it("reads back to exactly the rows on screen", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},"1,250.50"\nINV-2,USDC,nope,2\nINV-3,EURC,${A},3\nINV-4,USDC,${A},x`;
    const source = parseCsv(text);
    const e = leaveOut(withEdits(NO_EDITS, [
      { line: 2, field: "token", text: "USDC" }, { line: 2, field: "amount", text: "1250.50" },
      { line: 3, field: "to", text: A.toLowerCase() },
    ]), 5);
    const onScreen = checkRows(source, e, TOKENS, DECIMALS).rows;
    const reread = checkRows(parseCsv(correctedCsv(text, source, e)), NO_EDITS, TOKENS, DECIMALS).rows;
    expect(reread).toEqual(onScreen);
  });
});

describe("correctedFile", () => {
  it("names the file after the one chosen, in its own format", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${A},1`;
    const f = correctedFile({ text, source: parseCsv(text), edits: NO_EDITS, sourceName: "September.csv" });
    expect(f.name).toBe("September-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("names pasted rows as a tab-separated file", () => {
    const text = `invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`;
    const f = correctedFile({ text, source: parseCsv(text), edits: NO_EDITS, sourceName: PASTED_ROWS });
    expect(f.name).toBe("pasted-rows-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });
});
