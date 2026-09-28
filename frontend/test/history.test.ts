import { describe, it, expect } from "vitest";
import { paidText, settled } from "@/lib/history";

describe("the run list's Paid cell", () => {
  it("counts the invoices of a run whose receipt this browser saw", () => {
    expect(paidText({ itemCount: 3 })).toBe("3 invoices");
    expect(paidText({ itemCount: 1 })).toBe("1 invoice");
  });

  it("never calls a run paid before its receipt, whatever it was meant to pay", () => {
    expect(paidText({ itemCount: 3, awaitingReceipt: true })).toBe("No receipt yet");
  });

  it("reads a record from before the flag existed as seen, since only receipts were recorded then", () => {
    expect(paidText({ itemCount: 2, awaitingReceipt: undefined })).toBe("2 invoices");
  });
});

describe("a run recorded at broadcast settles on its receipt", () => {
  const sent = { txHash: "0xAB", payer: "0x1", chainId: 5042, runLabel: "2026-09", seenAt: 1, itemCount: 3, awaitingReceipt: true };
  const older = { txHash: "0xCD", payer: "0x1", chainId: 5042, runLabel: "2026-08", seenAt: 0, itemCount: 2 };

  it("stops saying 'no receipt yet' once the chain shows it succeeded", () => {
    const [r] = settled([sent], "0xab", "success");
    expect(r).not.toHaveProperty("awaitingReceipt");
    expect(paidText(r!)).toBe("3 invoices");
  });

  it("leaves the list if it reverted, since it moved nothing", () => {
    expect(settled([sent, older], "0xab", "reverted")).toEqual([older]);
  });

  it("never touches a run recorded on its receipt, or another run", () => {
    expect(settled([older], "0xcd", "reverted")).toEqual([older]);
    expect(settled([sent, older], "0xcd", "success")).toEqual([sent, older]);
  });
});
