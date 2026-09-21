import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/csv.js";

const GOOD = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;

describe("parseCsv", () => {
  it("reads every data row and numbers lines from the file, header included", () => {
    const { rows, issues } = parseCsv(GOOD);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      line: 2,
      invoiceId: "INV-US-001",
      tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a",
      amount: "0.10",
    });
    expect(rows[1]!.line).toBe(3);
  });

  it("survives a UTF-8 BOM, which every Excel export carries", () => {
    const { rows, issues } = parseCsv("﻿" + GOOD);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("survives CRLF line endings", () => {
    const { rows, issues } = parseCsv(GOOD.replace(/\n/g, "\r\n"));
    expect(issues).toEqual([]);
    expect(rows[0]!.amount).toBe("0.10");
  });

  it("reads a quoted field containing a comma", () => {
    const text = `invoiceId,token,to,amount
"INV, US, 001",USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toEqual([]);
    expect(rows[0]!.invoiceId).toBe("INV, US, 001");
  });

  it("reads a doubled quote inside a quoted field", () => {
    const text = `invoiceId,token,to,amount
"INV ""A""",USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows } = parseCsv(text);
    expect(rows[0]!.invoiceId).toBe('INV "A"');
  });

  it("skips blank lines without treating them as rows", () => {
    const { rows, issues } = parseCsv(GOOD + "\n\n\n");
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("rejects a file whose header names are wrong", () => {
    const { rows, issues } = parseCsv("id,coin,address,value\na,b,c,d");
    expect(rows).toEqual([]);
    expect(issues[0]!.line).toBe(1);
    expect(issues[0]!.message).toMatch(/invoiceId,token,to,amount/);
  });

  it("rejects a file with no header at all", () => {
    const { issues } = parseCsv("");
    expect(issues[0]!.message).toMatch(/empty/i);
  });

  it("reports a row with the wrong number of columns, and keeps going", () => {
    const text = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.line).toBe(3);
  });

  it("accepts header names in any case, since Excel retitles columns", () => {
    const { issues } = parseCsv("InvoiceID,Token,To,Amount\na,b,c,d");
    expect(issues).toEqual([]);
  });

  it("fails closed on a newline inside a quoted field rather than inventing a row", () => {
    const text = `invoiceId,token,to,amount
"INV
001",USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    // Not supported, and deliberately so — but it must never yield a row that
    // looks valid and pays the wrong thing.
    expect(rows).toEqual([]);
    expect(issues.length).toBeGreaterThan(0);
  });
});
