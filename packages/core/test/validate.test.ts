import { describe, it, expect } from "vitest";
import { validateRun } from "../src/validate.js";
import type { ResolvedRow } from "../src/csv.js";

const TOKEN = "0x3600000000000000000000000000000000000000" as const;
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as const;

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

  it("rejects the zero address, which Arc reverts on", () => {
    const r = validateRun([row({ to: "0x0000000000000000000000000000000000000000" })]);
    expect(r.errors[0]!.line).toBe(2);
    expect(r.errors[0]!.message).toMatch(/zero address/i);
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

  it("warns about a repeated recipient without blocking it", () => {
    const r = validateRun([
      row({ line: 2, invoiceId: "INV-1" }),
      row({ line: 3, invoiceId: "INV-2" }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.line).toBe(3);
    expect(r.warnings[0]!.message).toMatch(/two invoices to one recipient is valid/i);
  });

  it("rejects an empty run", () => {
    expect(validateRun([]).errors[0]!.message).toMatch(/no rows/i);
  });
});
