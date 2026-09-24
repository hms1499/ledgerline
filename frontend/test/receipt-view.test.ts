import { describe, it, expect } from "vitest";
import type { ReceiptResult } from "@ledgerline/core";
import { absentHeadline } from "@/lib/receipt-view";

const result = (state: ReceiptResult["state"]) =>
  ({ state, severity: "error", rungs: [] }) as ReceiptResult;

describe("absentHeadline — what the amount slot says when no payment is shown", () => {
  it("does not claim there is no payment when the link merely lacks evidence", () => {
    // bad_link means the checks never ran. "No payment found" is a claim
    // about the chain, and the chain was never asked.
    expect(absentHeadline(result("bad_link"))).toBe("Cannot be checked");
  });

  it("says no payment when the chain was asked and has none", () => {
    expect(absentHeadline(result("memo_absent"))).toBe("No payment found");
  });

  it("says nothing was paid for a reverted run", () => {
    expect(absentHeadline(result("run_reverted"))).toBe("Nothing was paid");
  });
});
