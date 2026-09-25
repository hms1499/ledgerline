import { describe, it, expect } from "vitest";
import { isCancelled, BLOCKED_COPY, CANCELLED, FEE_ADVICE } from "@/lib/pay-copy";

describe("isCancelled", () => {
  it("reads a 4001 however deep the wallet and viem buried it", () => {
    expect(isCancelled({ code: 4001 })).toBe(true);
    expect(isCancelled({ shortMessage: "User rejected the request.", cause: { code: 4001 } })).toBe(true);
    expect(isCancelled({ cause: { data: { code: 4001 } } })).toBe(true);
  });
  it("is not a cancel for anything else", () => {
    expect(isCancelled({ code: -32603 })).toBe(false);
    expect(isCancelled(new Error("nope"))).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
  });
});

describe("pay copy", () => {
  it("says nothing moved, for a cancel and for every blocked reason", () => {
    expect(CANCELLED.payment.body).toBe("Nothing was signed and no money moved.");
    for (const text of Object.values(BLOCKED_COPY)) expect(text).toMatch(/Nothing was signed/);
  });
  it("keeps the fee floor for the payer who edits the fee", () => {
    expect(FEE_ADVICE).toMatch(/Keep the fee it suggests/);
    expect(FEE_ADVICE).toMatch(/25 Gwei/);
  });
});
