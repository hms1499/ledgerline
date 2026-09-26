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
      cells: ["INV-US-001", "USDC", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "0.10"],
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

  it("keeps a row with the wrong number of values, marked unreadable, and keeps going", () => {
    const text = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
    expect(rows[0]!.unreadable).toEqual({
      message: "This line has 3 values but the first line names 4 columns. A value that contains a comma needs quotes around it.",
      text: "INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a",
    });
    expect(rows[0]!.invoiceId).toBe("");
    expect(rows[1]!.unreadable).toBeUndefined();
    expect(resolveRows(rows, TOKENS, DECIMALS).issues).toEqual([
      { line: 2, message: rows[0]!.unreadable!.message },
    ]);
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
    expect(issues).toEqual([]);
    expect(rows.every((r) => r.unreadable)).toBe(true);
    const resolved = resolveRows(rows, TOKENS, DECIMALS);
    expect(resolved.items).toEqual([]);
    expect(resolved.issues.length).toBeGreaterThan(0);
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
      cells: ["12.50", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "INV-1", "USDC"],
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

  it("reads a semicolon amount that could be a thousands group, and asks for a second look", () => {
    // LibreOffice can write ";" with US number formatting: "1,000" there is
    // a thousand to the person who typed it, and 1 to this reader.
    const a = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const { rows, issues, delimiter } = parseCsv(`invoiceId;token;to;amount
INV-1;USDC;${a};1,000
INV-2;USDC;${a};12,500
INV-3;cirBTC;${a};0,125
INV-4;USDC;${a};1,5
INV-5;USDC;${a};1234,567`);
    expect(issues).toEqual([]);
    const resolved = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(resolved.issues).toEqual([]);
    expect(resolved.items.map((i) => i.amount)).toEqual([1_000_000n, 12_500_000n, 12_500_000n, 1_500_000n, 1_234_567_000n]);
    expect(resolved.warnings).toEqual([
      { line: 2, field: "amount", kind: "comma-or-thousands", readings: ["1", "1000"],
        message: 'In a file separated by ";", the comma marks decimals, so "1,000" is read as 1, not 1000. If you meant 1000, write it without the comma.' },
      { line: 3, field: "amount", kind: "comma-or-thousands", readings: ["12.5", "12500"],
        message: 'In a file separated by ";", the comma marks decimals, so "12,500" is read as 12,5, not 12500. If you meant 12500, write it without the comma.' },
    ]);
  });

  it("has no second look to ask for in a comma file", () => {
    const a = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const { rows, delimiter } = parseCsv(`invoiceId,token,to,amount\nINV-1,USDC,${a},1.000`);
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).warnings).toEqual([]);
  });

  it("reads a semicolon file and its decimal commas", () => {
    const { rows, issues, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV,1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;0,10`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(";");
    expect(rows[0]!.invoiceId).toBe("INV,1");
    expect(rows[0]!.amount).toBe("0,10");
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).items[0]!.amount).toBe(100_000n);
  });

  it("refuses a dot in a semicolon file's amount when it could group thousands, since 1.000 may mean a thousand", () => {
    const text = `invoiceId;token;to;amount
INV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1.000
INV-2;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1,000,50
INV-3;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;2
INV-4;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;12.500
INV-5;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1.250,50`;
    const { rows, delimiter } = parseCsv(text);
    const { items, issues } = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(items.map((r) => r.invoiceId)).toEqual(["INV-3"]);
    expect(issues.map((i) => i.line)).toEqual([2, 3, 5, 6]);
    expect(issues[0]!.message).toBe(
      'In a file separated by ";", "1.000" could mean 1 or 1000. Write 1000 for the larger amount, or 1 for the smaller.',
    );
    expect(issues[1]!.message).toBe(
      'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1,000,50".',
    );
    expect(issues[2]!.message).toBe(
      'In a file separated by ";", "12.500" could mean 12,5 or 12500. Write 12500 for the larger amount, or 12,5 for the smaller.',
    );
  });

  // Numbers set to a region where the comma is the decimal mark keeps "0.10"
  // as text, then exports with ";" and writes the text as it was: the file a
  // person gets by opening the sample in Numbers and exporting it again.
  it("reads a dot in a semicolon file's amount as the decimal when it cannot group thousands", () => {
    const a = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const { rows, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV-US-001;USDC;${a};0.10\nINV-EU-002;EURC;${a};0.10\nINV-BTC-003;cirBTC;${a};0.000001\nINV-4;USDC;${a};1.5\nINV-5;USDC;${a};0.100`,
    );
    const { items, issues, warnings } = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
    expect(items.map((i) => i.amount)).toEqual([100_000n, 100_000n, 100n, 1_500_000n, 100_000n]);
  });

  it("says which mark to quote when a semicolon row has the wrong number of values", () => {
    const { rows } = parseCsv(`invoiceId;token;to;amount\nINV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a`);
    expect(rows[0]!.unreadable!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a semicolon needs quotes around it.",
    );
  });

  // Cells copied from Numbers, Excel or Google Sheets reach the clipboard as
  // tab-separated text, as the sheet displays them.
  it("reads cells pasted from a spreadsheet, whose commas and semicolons are text", () => {
    const { rows, issues, delimiter } = parseCsv(
      "Invoice\tToken\tRecipient\tAmount\r\nINV,1;A\tUSDC\t0xe48A096B9E74f064b13c17734af29F85E02d732a\t0.10\r\n",
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe("\t");
    expect(rows).toEqual([{
      line: 2,
      invoiceId: "INV,1;A",
      tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a",
      amount: "0.10",
      cells: ["INV,1;A", "USDC", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "0.10"],
    }]);
  });

  it("leaves a pasted amount as the sheet displayed it, so 1,250.50 is refused later, never guessed", () => {
    const { rows, issues, delimiter } = parseCsv(
      "invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t0xe48A096B9E74f064b13c17734af29F85E02d732a\t1,250.50",
    );
    expect(issues).toEqual([]);
    expect(rows[0]!.amount).toBe("1,250.50");
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).issues[0]).toMatchObject({
      field: "amount", kind: "thousands-marks", readings: ["1250.50"],
    });
  });

  it("says a tab is the mark when a pasted row has the wrong number of values", () => {
    const { rows } = parseCsv("invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t0xe48A096B9E74f064b13c17734af29F85E02d732a");
    expect(rows[0]!.unreadable!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a tab needs quotes around it.",
    );
  });

  it("keeps the header as written and where each field sits, for a corrected file", () => {
    const { header, columns } = parseCsv(`Name,Amount,Recipient,Invoice ID,Currency\nAn,1,0x,INV-1,USDC`);
    expect(header).toEqual(["Name", "Amount", "Recipient", "Invoice ID", "Currency"]);
    expect(columns).toEqual({ invoiceId: 3, token: 4, to: 2, amount: 1 });
    expect(parseCsv("id,coin\n1,2").columns).toBeUndefined();
  });
});

import { toBaseUnits, resolveRows, readAmount, amountInFile } from "../src/csv.js";
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
    line: 2, invoiceId: "INV-1", tokenSymbol: "USDC", to: TO, amount: "0.10", cells: [], ...over,
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
    expect(issues[0]).toEqual({ line: 2, field: "token", message: expect.stringMatching(/DAI/) });
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
    // Not the payer's to fix: no field, so the card offers only "Leave out".
    expect(issues[0]!.field).toBeUndefined();
  });

  it("names every field a row gets wrong at once, not only the first", () => {
    const { items, issues } = resolveRows(
      [row({ invoiceId: "", tokenSymbol: "USD", to: "vitalik.eth", amount: "1,250.50" })], TOKENS, DECIMALS,
    );
    expect(items).toEqual([]);
    expect(issues.map((i) => i.field)).toEqual(["invoiceId", "token", "to", "amount"]);
  });

  it("checks an amount's form even when the token is unknown", () => {
    const { issues } = resolveRows([row({ tokenSymbol: "USD", amount: "0" })], TOKENS, DECIMALS);
    expect(issues.map((i) => [i.field, i.message])).toEqual([
      ["token", '"USD" is not a token this page pays. Use one of: USDC, EURC, cirBTC.'],
      ["amount", "The amount is zero. Enter the amount owed, or remove this line."],
    ]);
  });
});

describe("readAmount", () => {
  it("reads a comma file's plain amount as written, and leaves the rest to toBaseUnits", () => {
    expect(readAmount("12.50", ",")).toEqual({ ok: true, amount: "12.50" });
    expect(readAmount(" 7 ", "\t")).toEqual({ ok: true, amount: "7" });
    expect(readAmount("$20", ",")).toEqual({ ok: true, amount: "$20" });
    expect(readAmount("", ",")).toEqual({ ok: true, amount: "" });
  });

  it("offers both readings of 1,000 in a comma file, since a comma-decimal sheet can write it", () => {
    expect(readAmount("1,000", ",")).toEqual({
      ok: false, kind: "comma-or-thousands", readings: ["1", "1000"],
      message: '"1,000" could mean 1 or 1000. Write 1000 for the larger amount, or 1 for the smaller.',
    });
    expect(readAmount("1,500", "\t")).toMatchObject({ ok: false, readings: ["1.5", "1500"] });
  });

  it("offers the one reading of an amount with thousands marks", () => {
    expect(readAmount("1,250.50", ",")).toEqual({
      ok: false, kind: "thousands-marks", readings: ["1250.50"],
      message: '"1,250.50" has marks between the thousands. Write it as 1250.50.',
    });
    expect(readAmount("1,000,000", "\t")).toMatchObject({ kind: "thousands-marks", readings: ["1000000"] });
  });

  it("reads a semicolon file's decimal comma, and warns when it could be a thousand", () => {
    expect(readAmount("0,10", ";")).toEqual({ ok: true, amount: "0.10" });
    expect(readAmount("1,000", ";")).toEqual({
      ok: true, amount: "1", kind: "comma-or-thousands", readings: ["1", "1000"],
      warning: 'In a file separated by ";", the comma marks decimals, so "1,000" is read as 1, not 1000. If you meant 1000, write it without the comma.',
    });
    expect(readAmount("12,500", ";")).toMatchObject({ ok: true, amount: "12.5", readings: ["12.5", "12500"] });
  });

  it("reads a semicolon file's dot when it cannot group thousands, and refuses one that could", () => {
    expect(readAmount("0.10", ";")).toEqual({ ok: true, amount: "0.10" });
    expect(readAmount("0.000001", ";")).toEqual({ ok: true, amount: "0.000001" });
    expect(readAmount("12.500", ";")).toEqual({
      ok: false, kind: "dot-or-thousands", readings: ["12.5", "12500"],
      message: 'In a file separated by ";", "12.500" could mean 12,5 or 12500. Write 12500 for the larger amount, or 12,5 for the smaller.',
    });
  });

  it("offers the one reading of a semicolon amount with thousands marks", () => {
    expect(readAmount("1.250,50", ";")).toEqual({
      ok: false, kind: "thousands-marks", readings: ["1250.50"],
      message: '"1.250,50" has marks between the thousands. Write it as 1250,50.',
    });
    expect(readAmount("1.000.000", ";")).toMatchObject({ kind: "thousands-marks", readings: ["1000000"] });
  });

  it("refuses anything else in a semicolon file, saying how to write it", () => {
    expect(readAmount("1,000,50", ";")).toEqual({
      ok: false,
      message: 'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1,000,50".',
    });
  });
});

describe("amountInFile", () => {
  it("writes the decimal mark the file uses", () => {
    expect(amountInFile("12.5", ";")).toBe("12,5");
    expect(amountInFile("12.5", ",")).toBe("12.5");
    expect(amountInFile("1000", ";")).toBe("1000");
  });
});
