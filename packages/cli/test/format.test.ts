import { describe, it, expect } from "vitest";
import { formatAmount, formatRows } from "../src/format.js";
import type { ReconcileRow } from "@ledgerline/core";

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

describe("formatRows", () => {
  it("puts the most severe rows first, because problems are why you opened this", () => {
    const rows: ReconcileRow[] = [
      { status: "matched", memoId: "0x01", token: "0x36" } as ReconcileRow,
      { status: "unlinked", memoId: "0x02", token: "0x36" } as ReconcileRow,
      { status: "unpaid", memoId: "0x03", token: "0x36" } as ReconcileRow,
    ];
    const out = formatRows(rows, new Map());
    const order = out.map((l) => l.status);
    expect(order[0]).toBe("unlinked");
    expect(order[1]).toBe("unpaid");
    expect(order[2]).toBe("matched");
  });
});
