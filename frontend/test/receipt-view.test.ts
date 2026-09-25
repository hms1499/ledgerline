import { describe, it, expect } from "vitest";
import type { ReceiptResult } from "@ledgerline/core";
import { absentHeadline, paidAtText } from "@/lib/receipt-view";

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

describe("paidAtText", () => {
  // 2026-09-24 07:46:00 UTC
  const T = 1_790_235_960n;
  it("prints day, month, year and time in English, in the given zone, zone named", () => {
    expect(paidAtText(T, "Asia/Ho_Chi_Minh")).toBe("24 Sep 2026, 14:46 GMT+7");
    expect(paidAtText(T, "UTC")).toBe("24 Sep 2026, 07:46 GMT");
    expect(paidAtText(Number(T), "America/New_York")).toBe("24 Sep 2026, 03:46 GMT-4");
  });
  it("does not pad a single-digit day", () => {
    expect(paidAtText(1_788_566_400, "UTC")).toBe("5 Sep 2026, 00:00 GMT");
  });
});
