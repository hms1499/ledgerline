import { describe, it, expect } from "vitest";
import { pad } from "viem";
import { verifyReceipt, type ReceiptInput } from "../src/verify.js";
import {
  ARC_CHAIN_ID, MEMO_TOPIC, TRANSFER_TOPIC, USDC_ADDRESS,
} from "../src/constants.js";
import { memoIdFor } from "../src/memo.js";
import type { RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

// The fixture's memoIds are keccak(utf8(invoiceId)) — an empty-salt path — so
// tests inject the derivation rather than pretending a salt reproduces them.
const fixtureMemoId = () =>
  "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7" as const;

const R1 = "0x2222222222222222222222222222222222222222";

/**
 * The same run, paid in a lookalike: a contract at another address that
 * emits Transfer exactly as USDC does. The real `Memo` wraps a call to any
 * contract, so its log names the lookalike as target, and the calldata hash
 * still matches because it covers only transfer(to, value).
 */
const LOOKALIKE = "0x00000000000000000000000000000000000fa4e0";
const usdcTopic = pad(USDC_ADDRESS.toLowerCase() as `0x${string}`, { size: 32 });
const lookalikeLogs: RawLog[] = logs.map((l) => {
  if (l.topics[0] === MEMO_TOPIC && l.topics[2]?.toLowerCase() === usdcTopic) {
    return { ...l, topics: [l.topics[0]!, l.topics[1]!, pad(LOOKALIKE, { size: 32 }), l.topics[3]!] };
  }
  if (l.topics[0] === TRANSFER_TOPIC && l.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    return { ...l, address: LOOKALIKE };
  }
  return l;
});

function input(over: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    chainId: ARC_CHAIN_ID,
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
  it("passes rungs 1 to 5 and reports the payment", () => {
    const r = verifyReceipt(input());
    expect(rung(r, "tx_found").status).toBe("pass");
    expect(rung(r, "payment_found").status).toBe("pass");
    expect(rung(r, "invoice_match").status).toBe("pass");
    expect(rung(r, "token_known").status).toBe("pass");
    expect(rung(r, "identity_intact").status).toBe("pass");
    expect(r.payment!.value).toBe(1_000_000n);
    expect(r.payment!.token.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
  });

  it("explains the invoice match without engineering words", () => {
    expect(rung(verifyReceipt(input()), "invoice_match").detail).toBe(
      "Proven by rebuilding this payment and matching it to the invoice's reference — not by its position or amount.",
    );
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

  it("unknown_token — critical — when the payment is in a lookalike of USDC", () => {
    const r = verifyReceipt(input({ logs: lookalikeLogs, runCommitted: true, anchorProofValid: true }));
    expect(r.state).toBe("unknown_token");
    expect(r.severity).toBe("critical");
    expect(rung(r, "invoice_match").status).toBe("pass");
    expect(rung(r, "token_known").status).toBe("fail");
    expect(rung(r, "token_known").detail!.toLowerCase()).toContain(LOOKALIKE);
    // A proof that verifies must not rescue it: the payer can put a
    // lookalike on their own list as easily as they can pay in one.
    expect(rung(r, "anchored").status).toBe("skipped");
    expect(r.payment!.token.toLowerCase()).toBe(LOOKALIKE);
  });

  it("knows the tokens by network: USDC's address is real on testnet too", () => {
    const r = verifyReceipt(input({ chainId: 5042002 }));
    expect(rung(r, "token_known").status).toBe("pass");
  });

  it("does not take a Memo log from any other contract as evidence", () => {
    const impostor = logs.map((l) =>
      l.topics[0] === MEMO_TOPIC ? { ...l, address: "0x000000000000000000000000000000000000beef" as const } : l,
    );
    expect(verifyReceipt(input({ logs: impostor })).state).toBe("memo_absent");
  });

  it("proof_invalid says the payment is real but was not in the manifest", () => {
    const r = verifyReceipt(input({ anchorProofValid: false, runCommitted: true }));
    expect(r.state).toBe("proof_invalid");
    expect(rung(r, "payment_found").status).toBe("pass");
  });
});

describe("verifyReceipt — the ladder is always complete", () => {
  it("returns all six rungs even when an early one fails", () => {
    const r = verifyReceipt(input({ receiptStatus: "reverted" }));
    expect(r.rungs).toHaveLength(6);
    expect(r.rungs.filter((x) => x.status === "skipped").length).toBeGreaterThan(0);
  });

  it("never reports a later rung as passed once an earlier one failed", () => {
    for (const r of [
      verifyReceipt(input({ receiptStatus: "reverted" })),
      verifyReceipt(input({ logs: lookalikeLogs, runCommitted: true, anchorProofValid: true })),
    ]) {
      const firstFail = r.rungs.findIndex((x) => x.status === "fail");
      expect(firstFail).toBeGreaterThanOrEqual(0);
      expect(r.rungs.slice(firstFail + 1).every((x) => x.status !== "pass")).toBe(true);
    }
  });

  it("derives memoId from salt and invoiceId by default", () => {
    const salt = ("0x" + "07".repeat(32)) as `0x${string}`;
    const r = verifyReceipt({
      chainId: ARC_CHAIN_ID, invoiceId: "INV-US-001", runSalt: salt, receiptStatus: "success", logs: [],
    });
    expect(r.derivedMemoId).toBe(memoIdFor(salt, "INV-US-001"));
  });
});
