import { describe, it, expect } from "vitest";
import { validateRun } from "../src/validate.js";
import type { ResolvedRow } from "../src/csv.js";

const TOKEN = "0x3600000000000000000000000000000000000000" as const;
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as const;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as const;
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as const;

const row = (over: Partial<ResolvedRow> = {}): ResolvedRow => ({
  line: 2, invoiceId: "INV-1", token: TOKEN, to: TO, amount: 100_000n, ...over,
});

describe("validateRun", () => {
  it("passes a clean run with nothing to say", () => {
    const r = validateRun([
      row(),
      row({ line: 3, invoiceId: "INV-2", to: "0x1111111111111111111111111111111111111111" }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("words every refusal as what to do", () => {
    const to = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const token = "0x3600000000000000000000000000000000000000";
    const r = validateRun([
      { line: 2, invoiceId: "INV-1", token, to, amount: 1n },
      { line: 3, invoiceId: "INV-1", token, to: "0x0000000000000000000000000000000000000000", amount: 1n },
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([
      "This pays 0x0000…0000, an address nobody owns. Arc refuses the payment. Check the recipient.",
      'Invoice "INV-1" is also on line 2. Give each payment its own invoice reference, or the two cannot be told apart.',
    ]);
    expect(validateRun([]).errors[0]!.message).toBe("This file has no payments in it.");
  });

  it("rejects the zero address, which Arc reverts on", () => {
    const r = validateRun([row({ to: "0x0000000000000000000000000000000000000000" })]);
    expect(r.errors[0]!.line).toBe(2);
    expect(r.errors[0]!.message).toMatch(/nobody owns/);
  });

  it("rejects a duplicate invoice id and names the line that repeats it", () => {
    const r = validateRun([row({ line: 2 }), row({ line: 7 })]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.line).toBe(7);
    expect(r.errors[0]!.message).toMatch(/INV-1/);
    expect(r.errors[0]!.message).toMatch(/line 2/);
  });

  it("rejects a run over the item limit", () => {
    const many = Array.from({ length: 401 }, (_, i) =>
      row({ line: i + 2, invoiceId: `INV-${i}` }));
    const r = validateRun(many);
    expect(r.errors.some((e) => /400/.test(e.message))).toBe(true);
  });

  it("accepts exactly the item limit", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      row({ line: i + 2, invoiceId: `INV-${i}` }));
    expect(validateRun(many).errors).toEqual([]);
  });

  it("warns about the same recipient paid twice in the same token", () => {
    const r = validateRun([
      row({ line: 2, invoiceId: "INV-1" }),
      row({ line: 3, invoiceId: "INV-2" }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.line).toBe(3);
    expect(r.warnings[0]!.message).toMatch(/already paid on line 2/i);
  });

  // The product's own demo is one recipient paid in three tokens. Warning on
  // it trains people to dismiss the channel that also carries real warnings,
  // and a different token cannot be the duplicated paste this rule is for.
  it("says nothing about one recipient paid in three different tokens", () => {
    const r = validateRun([
      row({ line: 2, invoiceId: "INV-1" }),
      row({ line: 3, invoiceId: "INV-2", token: EURC }),
      row({ line: 4, invoiceId: "INV-3", token: CIRBTC }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("compares tokens without case sensitivity", () => {
    const r = validateRun([
      row({ line: 2, invoiceId: "INV-1", token: TOKEN.toUpperCase() as `0x${string}` }),
      row({ line: 3, invoiceId: "INV-2" }),
    ]);
    expect(r.warnings).toHaveLength(1);
  });

  it("rejects an empty run", () => {
    expect(validateRun([]).errors[0]!.message).toMatch(/no payments/i);
  });

  it("says nothing about an empty run when the file's rows were refused, not absent", () => {
    // A misnamed header over 50 payments listed "This file has no payments in
    // it." first, and counted it as a second problem.
    expect(validateRun([], 1)).toEqual({ errors: [], warnings: [] });
  });
});
