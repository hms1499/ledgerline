import { describe, it, expect } from "vitest";
import { formatAmount, formatRows, amountText, type TokenMeta } from "../src/format.js";
import type { Address, ReconcileRow } from "@ledgerline/core";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;

const meta = new Map<Address, TokenMeta>([
  [USDC, { decimals: 6, symbol: "USDC" }],
  [EURC, { decimals: 6, symbol: "EURC" }],
]);

describe("formatAmount", () => {
  it("renders 6-decimal USDC", () => {
    expect(formatAmount(1_500_000n, 6)).toBe("1.5");
  });
  it("renders 8-decimal cirBTC without losing precision", () => {
    expect(formatAmount(1_000n, 8)).toBe("0.00001");
  });
  it("renders a zero", () => {
    expect(formatAmount(0n, 6)).toBe("0");
  });
});

describe("amountText", () => {
  it("names the token, so two tokens paying the same figure are told apart", () => {
    expect(amountText(100_000n, USDC, meta)).toBe("0.1 USDC");
    expect(amountText(100_000n, EURC, meta)).toBe("0.1 EURC");
  });

  it("never guesses decimals: unknown decimals print the raw integer and the token", () => {
    expect(amountText(100_000n, USDC, new Map())).toBe("100000 (0x3600…0000)");
  });

  it("falls back to the short token address when the symbol is unreadable", () => {
    const noSymbol = new Map<Address, TokenMeta>([[USDC, { decimals: 6 }]]);
    expect(amountText(100_000n, USDC, noSymbol)).toBe("0.1 0x3600…0000");
  });
});

describe("formatRows", () => {
  it("puts the most severe rows first, because problems are why you opened this", () => {
    const rows: ReconcileRow[] = [
      { status: "matched", memoId: "0x01", token: USDC } as ReconcileRow,
      { status: "unlinked", memoId: "0x02", token: USDC } as ReconcileRow,
      { status: "unpaid", memoId: "0x03", token: USDC } as ReconcileRow,
    ];
    const out = formatRows(rows, meta, true);
    const order = out.map((l) => l.status);
    expect(order[0]).toBe("unlinked");
    expect(order[1]).toBe("unpaid");
    expect(order[2]).toBe("matched");
  });

  it("calls a payment read without a run file paid, not unexpected", () => {
    const rows: ReconcileRow[] = [
      { status: "unexpected", memoId: "0x01", token: USDC, to: USDC, actual: 100_000n },
    ];
    const line = formatRows(rows, meta, false)[0]!;
    expect(line.line).toMatch(/^paid\s/);
    expect(line.line).not.toContain("unexpected");
    expect(line.line).toContain("0.1 USDC");
  });

  it("keeps unexpected when a run file was given and the payment is not on it", () => {
    const rows: ReconcileRow[] = [
      { status: "unexpected", memoId: "0x01", token: USDC, to: USDC, actual: 100_000n },
    ];
    const line = formatRows(rows, meta, true)[0]!;
    expect(line.line).toMatch(/^unexpected\s/);
  });

  it("prints the expected amount of a wrong-amount row in the token's own decimals", () => {
    const rows: ReconcileRow[] = [
      {
        status: "amount_mismatch", memoId: "0x01", token: EURC, to: USDC,
        actual: 90_000n, expected: 100_000n,
      },
    ];
    const line = formatRows(rows, meta, true)[0]!;
    expect(line.line).toContain("0.09 EURC");
    expect(line.line).toContain("(expected 0.1 EURC)");
  });
});
