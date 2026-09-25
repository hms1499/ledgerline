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
    expect(issues[0]!.message).toMatch(/Missing: invoiceId, token\./);
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
    expect(issues[0]!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a comma needs quotes around it.",
    );
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

  it("maps columns by name, in any order, through a spreadsheet's own names", () => {
    const { rows, issues, delimiter } = parseCsv(
      `Amount,Recipient,Invoice ID,Currency\n12.50,0xe48A096B9E74f064b13c17734af29F85E02d732a,INV-1,USDC`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(",");
    expect(rows[0]).toEqual({
      line: 2, invoiceId: "INV-1", tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a", amount: "12.50",
    });
  });

  it("ignores a column it does not know, such as a name", () => {
    const { rows, issues } = parseCsv(
      `Name,invoiceId,token,to,amount\n"Nguyen, An",INV-1,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,5`,
    );
    expect(issues).toEqual([]);
    expect(rows[0]!.invoiceId).toBe("INV-1");
    expect(rows[0]!.amount).toBe("5");
  });

  it("reads a row with a trailing delimiter under a header that has one too", () => {
    const { rows, issues } = parseCsv(
      `invoiceId,token,to,amount,\nINV-1,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,10,`,
    );
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("refuses a file where two columns could be the same field", () => {
    const { rows, issues } = parseCsv(`invoiceId,token,to,Amount,Value\na,b,c,1,2`);
    expect(rows).toEqual([]);
    expect(issues[0]!.message).toBe('Two columns could be the amount: "Amount" and "Value". Keep one.');
  });

  it("names what is missing and what it found", () => {
    const { issues } = parseCsv(`Invoice ID,Token,Recipient,Salary\na,b,c,1`);
    expect(issues[0]).toEqual({
      line: 1,
      message: "The first line must name the columns invoiceId, token, to and amount, in any order. Missing: amount. Found: Invoice ID, Token, Recipient, Salary.",
    });
  });

  it("reads a semicolon file and its decimal commas", () => {
    const { rows, issues, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV,1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;0,10`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(";");
    expect(rows[0]!.invoiceId).toBe("INV,1");
    expect(rows[0]!.amount).toBe("0.10");
  });

  it("refuses a dot in a semicolon file's amount, since 1.000 may mean a thousand", () => {
    const text = `invoiceId;token;to;amount
INV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1.000
INV-2;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1,000,50
INV-3;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;2`;
    const { rows, issues } = parseCsv(text);
    expect(rows.map((r) => r.invoiceId)).toEqual(["INV-3"]);
    expect(issues.map((i) => i.line)).toEqual([2, 3]);
    expect(issues[0]!.message).toBe(
      'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1.000".',
    );
  });

  it("says which mark to quote when a semicolon row has the wrong number of values", () => {
    const { issues } = parseCsv(`invoiceId;token;to;amount\nINV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a`);
    expect(issues[0]!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a semicolon needs quotes around it.",
    );
  });
});

import { toBaseUnits, resolveRows } from "../src/csv.js";
import { tokensForChain, ARC_TESTNET_CHAIN_ID } from "../src/constants.js";

const TOKENS = tokensForChain(ARC_TESTNET_CHAIN_ID);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6,
  [TOKENS.EURC.toLowerCase()]: 6,
  [TOKENS.cirBTC.toLowerCase()]: 8,
};
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("toBaseUnits", () => {
  it("converts a decimal amount at the token's scale", () => {
    expect(toBaseUnits("0.10", 6)).toEqual({ ok: true, value: 100_000n });
    expect(toBaseUnits("0.00001", 8)).toEqual({ ok: true, value: 1_000n });
    expect(toBaseUnits("1", 6)).toEqual({ ok: true, value: 1_000_000n });
  });

  it("keeps full precision on a value that would lose digits as a float", () => {
    // 123456789.123456 is not exactly representable in IEEE 754 binary64.
    expect(toBaseUnits("123456789.123456", 6)).toEqual({
      ok: true,
      value: 123_456_789_123_456n,
    });
  });

  it("accepts trailing zeros and a bare leading dot", () => {
    expect(toBaseUnits("0.1000", 6)).toEqual({ ok: true, value: 100_000n });
    expect(toBaseUnits(".1", 6)).toEqual({ ok: true, value: 100_000n });
  });

  it("refuses more precision than the token has, rather than rounding", () => {
    const r = toBaseUnits("0.0000001", 6, "USDC");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe(
      '"0.0000001" has 7 decimal places, but USDC has 6. Round it yourself, so the amount paid is exactly what you mean.',
    );
  });

  it("says how to write an amount it cannot read, and what to do with a zero", () => {
    expect(toBaseUnits("1,000", 6)).toEqual({
      ok: false, reason: '"1,000" is not an amount this page can read. Write it with digits and a dot only, like 1000 or 12.50.',
    });
    expect(toBaseUnits("0", 6)).toEqual({
      ok: false, reason: "The amount is zero. Enter the amount owed, or remove this line.",
    });
  });

  it("refuses scientific notation, separators, negatives, zero and empty", () => {
    for (const bad of ["1e-7", "1,000.50", "-5", "0", "", "abc", "1.2.3"]) {
      expect(toBaseUnits(bad, 6).ok, bad).toBe(false);
    }
  });
});

describe("resolveRows", () => {
  const row = (over: Partial<import("../src/csv.js").ParsedRow> = {}) => ({
    line: 2, invoiceId: "INV-1", tokenSymbol: "USDC", to: TO, amount: "0.10", ...over,
  });

  it("resolves a symbol to the chain's token address and scales the amount", () => {
    const { items, issues } = resolveRows([row()], TOKENS, DECIMALS);
    expect(issues).toEqual([]);
    expect(items[0]).toEqual({
      line: 2, invoiceId: "INV-1", token: TOKENS.USDC, to: TO, amount: 100_000n,
    });
  });

  it("uses each token's own decimals, not one shared number", () => {
    const { items } = resolveRows(
      [row({ tokenSymbol: "cirBTC", amount: "0.00001" })], TOKENS, DECIMALS,
    );
    expect(items[0]!.amount).toBe(1_000n);
  });

  it("matches a token symbol regardless of case", () => {
    const { items, issues } = resolveRows([row({ tokenSymbol: "usdc" })], TOKENS, DECIMALS);
    expect(issues).toEqual([]);
    expect(items[0]!.token).toBe(TOKENS.USDC);
  });

  it("reports an unknown symbol against its line and drops the row", () => {
    const { items, issues } = resolveRows([row({ tokenSymbol: "DAI" })], TOKENS, DECIMALS);
    expect(items).toEqual([]);
    expect(issues[0]).toEqual({ line: 2, message: expect.stringMatching(/DAI/) });
  });

  it("reports a malformed recipient address", () => {
    const { items, issues } = resolveRows([row({ to: "0x123" })], TOKENS, DECIMALS);
    expect(items).toEqual([]);
    expect(issues[0]!.message).toMatch(/address/i);
  });

  it("reports an empty invoice id, which would make a meaningless reference", () => {
    const { issues } = resolveRows([row({ invoiceId: "" })], TOKENS, DECIMALS);
    expect(issues[0]!.message).toMatch(/invoice/i);
  });

  it("collects every bad row instead of stopping at the first", () => {
    const { items, issues } = resolveRows(
      [row({ line: 2, tokenSymbol: "DAI" }), row({ line: 3, to: "nope" }), row({ line: 4 })],
      TOKENS, DECIMALS,
    );
    expect(issues).toHaveLength(2);
    expect(items).toHaveLength(1);
  });

  it("names the tokens it pays and what an address looks like", () => {
    const { issues } = resolveRows(
      [row({ line: 2, tokenSymbol: "USDT" }), row({ line: 3, to: "vitalik.eth" }), row({ line: 4, invoiceId: "" })],
      TOKENS, DECIMALS,
    );
    expect(issues.map((i) => i.message)).toEqual([
      '"USDT" is not a token this page pays. Use one of: USDC, EURC, cirBTC.',
      '"vitalik.eth" is not a wallet address. Use the full address: 0x followed by 40 letters and digits.',
      "The invoice reference is empty. Every payment needs one.",
    ]);
  });

  it("passes the token's own symbol to the precision message", () => {
    const { issues } = resolveRows([row({ amount: "0.0000001" })], TOKENS, DECIMALS);
    expect(issues[0]!.message).toMatch(/but USDC has 6/);
  });

  it("fails loudly when the decimals table is missing a token it was given", () => {
    const { issues } = resolveRows([row()], TOKENS, {});
    expect(issues[0]!.message).toMatch(/decimals/i);
  });
});
