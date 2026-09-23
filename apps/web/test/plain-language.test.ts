import { describe, it, expect } from "vitest";
import {
  verifyReceipt, assessCompleteness, checkManifestAgainstRoot, explainRevert,
  RUN_EXISTS_SELECTOR, EMPTY_RUN_SELECTOR, reconcile,
  type Manifest, type RawLog, type ReconcileStatus, type ReceiptState,
} from "@ledgerline/core";
import { statusView } from "@/lib/reconcile-view";
import { preflightRows } from "@/lib/preflight-view";
import { RECEIPT_COPY } from "@/lib/receipt-view";
import fixture from "../../../packages/core/test/fixtures/mainnet-2pay.json" with { type: "json" };

/**
 * The words the protocol is built from, which the people using it should
 * never need: a payer or recipient meets "the run file", "the reference
 * code" and "the payer's recorded list", not a manifest, a salt or an anchor.
 * /why and developer output keep the real terms; the screens do not.
 */
const JARGON = /\b(manifests?|anchor\w*|salt|merkle|preflight|commit\w*|root|run label)\b/i;

const clean = (text: string | undefined) => {
  if (text !== undefined) expect(text, text).not.toMatch(JARGON);
};

const logs = fixture.logs as unknown as RawLog[];
const memoIdFor = () =>
  "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7" as const;
const SALT = ("0x" + "00".repeat(32)) as `0x${string}`;

describe("copy a payer or recipient reads is free of protocol jargon", () => {
  it("the receipt page's verdicts", () => {
    for (const state of Object.keys(RECEIPT_COPY) as ReceiptState[]) {
      clean(RECEIPT_COPY[state]!.headline);
      clean(RECEIPT_COPY[state]!.body);
    }
  });

  it("the receipt page's checks, in every outcome", () => {
    const base = { invoiceId: "INV-001", runSalt: SALT, receiptStatus: "success" as const, logs, memoIdFor };
    for (const input of [
      base,
      { ...base, runSalt: undefined },
      { ...base, runCommitted: false },
      { ...base, runCommitted: true },
      { ...base, runCommitted: true, anchorProofValid: false },
      { ...base, runCommitted: true, anchorProofValid: true },
    ]) {
      for (const rung of verifyReceipt(input).rungs) { clean(rung.label); clean(rung.detail); }
    }
  });

  it("the run page's completeness and run-file notes", () => {
    for (const c of [
      { anchoredItemCount: undefined, paymentsFound: 2 },
      { anchoredItemCount: 3, paymentsFound: 2 },
      { anchoredItemCount: 1, paymentsFound: 2 },
      { anchoredItemCount: 2, paymentsFound: 2, unlinkedCount: 1 },
    ]) clean(assessCompleteness(c).note);

    const manifest: Manifest = {
      clientRunId: SALT, payer: "0x1111111111111111111111111111111111111111", chainId: 5042002,
      runSalt: SALT, items: [{ invoiceId: "A", token: "0x3600000000000000000000000000000000000000",
        to: "0x2222222222222222222222222222222222222222", amount: 1n }],
    };
    clean(checkManifestAgainstRoot(manifest, undefined).note);
    clean(checkManifestAgainstRoot(manifest, ("0x" + "ab".repeat(32)) as `0x${string}`).note);
    clean(checkManifestAgainstRoot({ ...manifest, items: [] }, ("0x" + "ab".repeat(32)) as `0x${string}`).note);
  });

  it("the run page's status tags and notes", () => {
    const statuses: ReconcileStatus[] = ["unlinked", "unpaid", "recipient_mismatch", "amount_mismatch", "unexpected", "matched"];
    for (const s of statuses) for (const m of [true, false]) {
      const v = statusView(s, m);
      clean(v.label); clean(v.note);
    }
    for (const row of reconcile(logs).rows) clean(row.note);
  });

  it("the check step's rows and the anchor's refusals", () => {
    clean(preflightRows([{ success: true, returnData: "0x" }], [])[0]!.label);
    clean(explainRevert({ data: RUN_EXISTS_SELECTOR }).message);
    clean(explainRevert({ data: EMPTY_RUN_SELECTOR }).message);
  });
});
