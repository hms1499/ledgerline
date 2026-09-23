import { describe, it, expect } from "vitest";
import { verifyReceipt, type ReceiptInput } from "../src/verify.js";
import { USDC_ADDRESS } from "../src/constants.js";
import { memoIdFor } from "../src/memo.js";
import type { RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

// The fixture's memoIds are keccak(utf8(invoiceId)) — an empty-salt path — so
// tests inject the derivation rather than pretending a salt reproduces them.
const fixtureMemoId = () =>
  "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7" as const;

const R1 = "0x2222222222222222222222222222222222222222";

function input(over: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    invoiceId: "INV-001",
    runSalt: ("0x" + "00".repeat(32)) as `0x${string}`,
    receiptStatus: "success",
    logs,
    memoIdFor: fixtureMemoId,
    ...over,
  };
}

function rung(r: ReturnType<typeof verifyReceipt>, id: string) {
  return r.rungs.find((x) => x.id === id)!;
}

describe("verifyReceipt — the happy path", () => {
  it("passes rungs 1 to 4 and reports the payment", () => {
    const r = verifyReceipt(input());
    expect(rung(r, "tx_found").status).toBe("pass");
    expect(rung(r, "payment_found").status).toBe("pass");
    expect(rung(r, "invoice_match").status).toBe("pass");
    expect(rung(r, "identity_intact").status).toBe("pass");
    expect(r.payment!.value).toBe(1_000_000n);
    expect(r.payment!.token.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
  });

  it("is `verified` only when the anchor proof also passed", () => {
    expect(verifyReceipt(input({ anchorProofValid: true })).state).toBe("verified");
  });
});

describe("verifyReceipt — honest degradation", () => {
  it("does not claim success when no proof was supplied", () => {
    const r = verifyReceipt(input());
    expect(r.state).toBe("verified_unanchored");
    expect(rung(r, "anchored").status).toBe("skipped");
  });

  it("says plainly what was not checked", () => {
    const r = verifyReceipt(input());
    expect(rung(r, "anchored").detail).toMatch(/does not carry the proof/i);
  });

  it("degrades rather than fails when the run was never anchored", () => {
    const r = verifyReceipt(input({ anchorProofValid: undefined, runCommitted: false }));
    expect(r.state).toBe("not_anchored");
    expect(rung(r, "payment_found").status).toBe("pass");
  });
});

describe("verifyReceipt — each failure names its rung", () => {
  it("bad_link when the invoiceId is missing", () => {
    expect(verifyReceipt(input({ invoiceId: "" })).state).toBe("bad_link");
  });

  it("bad_link when the salt is missing", () => {
    expect(verifyReceipt(input({ runSalt: undefined })).state).toBe("bad_link");
  });

  it("bad_link still reports the transaction it did find", () => {
    // The link lacks the salt, not the transaction. Leaving rung 1 unchecked
    // tells a recipient the payment may not exist, which the chain disproves.
    const r = verifyReceipt(input({ runSalt: undefined }));
    expect(r.state).toBe("bad_link");
    expect(rung(r, "tx_found").status).toBe("pass");
    expect(rung(r, "tx_found").detail).toMatch(/missing its reference code/);
  });

  it("run_reverted wins over an incomplete link — nothing was paid either way", () => {
    const r = verifyReceipt(input({ runSalt: undefined, receiptStatus: "reverted" }));
    expect(r.state).toBe("run_reverted");
    expect(rung(r, "tx_found").status).toBe("fail");
    expect(r.derivedMemoId).toBeUndefined();
  });

  it("run_reverted, and says nothing was paid", () => {
    const r = verifyReceipt(input({ receiptStatus: "reverted" }));
    expect(r.state).toBe("run_reverted");
    expect(rung(r, "tx_found").status).toBe("fail");
    expect(rung(r, "tx_found").detail).toMatch(/no money moved|nothing was paid/i);
  });

  it("memo_absent when no Memo carries this reference", () => {
    const r = verifyReceipt(input({ memoIdFor: () => ("0x" + "ff".repeat(32)) as `0x${string}` }));
    expect(r.state).toBe("memo_absent");
  });

  it("unlinked — critical — when a reference has no payment behind it", () => {
    const withoutTransfers = logs.filter(
      (l) => l.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    const r = verifyReceipt(input({ logs: withoutTransfers }));
    expect(r.state).toBe("unlinked");
    expect(r.severity).toBe("critical");
  });

  it("proof_invalid says the payment is real but was not in the manifest", () => {
    const r = verifyReceipt(input({ anchorProofValid: false, runCommitted: true }));
    expect(r.state).toBe("proof_invalid");
    expect(rung(r, "payment_found").status).toBe("pass");
  });
});

describe("verifyReceipt — the ladder is always complete", () => {
  it("returns all five rungs even when an early one fails", () => {
    const r = verifyReceipt(input({ receiptStatus: "reverted" }));
    expect(r.rungs).toHaveLength(5);
    expect(r.rungs.filter((x) => x.status === "skipped").length).toBeGreaterThan(0);
  });

  it("never reports a later rung as passed once an earlier one failed", () => {
    const r = verifyReceipt(input({ receiptStatus: "reverted" }));
    const firstFail = r.rungs.findIndex((x) => x.status === "fail");
    expect(r.rungs.slice(firstFail + 1).every((x) => x.status !== "pass")).toBe(true);
  });

  it("derives memoId from salt and invoiceId by default", () => {
    const salt = ("0x" + "07".repeat(32)) as `0x${string}`;
    const r = verifyReceipt({
      invoiceId: "INV-US-001", runSalt: salt, receiptStatus: "success", logs: [],
    });
    expect(r.derivedMemoId).toBe(memoIdFor(salt, "INV-US-001"));
  });
});
