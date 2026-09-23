import { joinPayments } from "./join.js";
import { memoIdFor as defaultMemoIdFor } from "./memo.js";
import type { Hex, PaymentRecord, RawLog } from "./types.js";

export type RungId =
  | "tx_found"
  | "payment_found"
  | "invoice_match"
  | "identity_intact"
  | "anchored";

export type RungStatus = "pass" | "fail" | "skipped";

export interface Rung {
  id: RungId;
  /** What this rung asserts, in the recipient's terms. */
  label: string;
  status: RungStatus;
  /** Why it passed, failed, or was not attempted. Never left empty on a fail. */
  detail?: string;
}

export type ReceiptState =
  | "bad_link"
  | "run_reverted"
  | "memo_absent"
  | "unlinked"
  | "identity_broken"
  | "not_anchored"
  | "proof_invalid"
  | "verified"
  | "verified_unanchored";

export type Severity = "ok" | "degraded" | "error" | "critical";

export interface ReceiptInput {
  invoiceId: string;
  runSalt?: Hex;
  /** From eth_getTransactionReceipt. */
  receiptStatus: "success" | "reverted";
  logs: RawLog[];
  /**
   * Result of PayoutAnchor.verifyItem, or undefined when the link carried no
   * proof. Passed in rather than fetched, so this stays a pure function over
   * evidence — the same rule reconcile() follows.
   */
  anchorProofValid?: boolean;
  /** Result of PayoutAnchor.isCommitted, when known. */
  runCommitted?: boolean;
  /** Injectable for fixtures that predate salted ids. */
  memoIdFor?: (runSalt: Hex, invoiceId: string) => Hex;
}

export interface ReceiptResult {
  state: ReceiptState;
  severity: Severity;
  rungs: Rung[];
  payment?: PaymentRecord;
  derivedMemoId?: Hex;
}

const LABELS: Record<RungId, string> = {
  tx_found: "Transaction found and succeeded",
  payment_found: "A payment to you is present",
  invoice_match: "The payment belongs to this invoice",
  identity_intact: "The payer signed this transaction directly",
  anchored: "The payment is on the payer's recorded list",
};

const SEVERITY: Record<ReceiptState, Severity> = {
  bad_link: "error",
  run_reverted: "error",
  memo_absent: "error",
  unlinked: "critical",
  identity_broken: "critical",
  not_anchored: "degraded",
  proof_invalid: "error",
  verified: "ok",
  verified_unanchored: "degraded",
};

/**
 * The verification ladder behind the receipt page.
 *
 * Governing rule from the spec: this must never fail opaquely. A recipient
 * opens it precisely because they do not want to trust us, so a bare "invalid"
 * destroys the property the page exists to demonstrate. Every outcome names
 * the rung that decided it, and every rung that was not attempted says so
 * rather than being quietly dropped.
 *
 * Pure. Takes no RPC handle; the two on-chain answers it cannot compute —
 * whether the run is committed and whether the Merkle proof verifies — arrive
 * as inputs.
 */
export function verifyReceipt(input: ReceiptInput): ReceiptResult {
  const memoIdFor = input.memoIdFor ?? defaultMemoIdFor;

  const rungs: Rung[] = (Object.keys(LABELS) as RungId[]).map((id) => ({
    id,
    label: LABELS[id],
    status: "skipped" as RungStatus,
  }));
  const at = (id: RungId) => rungs.find((r) => r.id === id)!;

  const done = (state: ReceiptState, payment?: PaymentRecord, derivedMemoId?: Hex) => ({
    state,
    severity: SEVERITY[state],
    rungs,
    payment,
    derivedMemoId,
  });

  const derivedMemoId = input.invoiceId && input.runSalt
    ? memoIdFor(input.runSalt, input.invoiceId)
    : undefined;

  // ── rung 1: the transaction exists and executed ────────────────────────
  // Decided before the link is judged, because it needs nothing from the
  // link: a reverted run paid nobody whatever the link carries, and a
  // successful one must not be shown as unchecked just because the link is
  // short of the evidence for the rungs after it.
  if (input.receiptStatus === "reverted") {
    at("tx_found").status = "fail";
    at("tx_found").detail =
      "This payout run did not execute. The transaction reverted, so no money moved and nothing was paid.";
    return done("run_reverted", undefined, derivedMemoId);
  }
  at("tx_found").status = "pass";

  // ── is the link usable for the rest ────────────────────────────────────
  if (!derivedMemoId) {
    const missing = [
      !input.invoiceId ? "invoice reference" : null,
      !input.runSalt ? "reference code" : null,
    ].filter(Boolean).join(" and ");
    at("tx_found").detail = `This link is incomplete — it is missing its ${missing}.`;
    return done("bad_link");
  }

  const { payments, unlinkedMemoIds } = joinPayments(input.logs);

  // ── rung 2 and 3 are decided together ──────────────────────────────────
  // A Memo with no Transfer behind it is the anomaly case, and it must be
  // reported as such rather than as "your payment is missing".
  if (unlinkedMemoIds.some((id) => id.toLowerCase() === derivedMemoId.toLowerCase())) {
    at("payment_found").status = "fail";
    at("payment_found").detail =
      "Anomaly: this invoice reference exists on chain, but no payment satisfies it. Contact the payer and keep this link.";
    return done("unlinked", undefined, derivedMemoId);
  }

  const payment = payments.find(
    (p) => p.memoId.toLowerCase() === derivedMemoId.toLowerCase(),
  );

  if (!payment) {
    at("payment_found").status = "fail";
    at("payment_found").detail =
      "This transaction exists, but it contains no payment carrying this invoice reference. The link may be for a different invoice or a different run.";
    return done("memo_absent", undefined, derivedMemoId);
  }

  at("payment_found").status = "pass";
  at("invoice_match").status = "pass";
  at("invoice_match").detail =
    "Proven by rebuilding the transfer calldata and matching its hash against the reference — not by position or amount.";

  // ── rung 4: the payer on record is the sender of funds ─────────────────
  if (payment.identityBroken) {
    at("identity_intact").status = "fail";
    at("identity_intact").detail =
      "The payer on record differs from the address the funds came from.";
    return done("identity_broken", payment, derivedMemoId);
  }
  at("identity_intact").status = "pass";

  // ── rung 5: membership of the committed manifest ───────────────────────
  if (input.runCommitted === false) {
    at("anchored").detail =
      "Payment verified against the chain, but the payer never recorded a list for this run, so there is no list to check it against.";
    return done("not_anchored", payment, derivedMemoId);
  }

  if (input.anchorProofValid === undefined) {
    at("anchored").detail =
      "Not checked — this link does not carry the proof for the payer's recorded list. The payment itself is verified.";
    return done("verified_unanchored", payment, derivedMemoId);
  }

  if (!input.anchorProofValid) {
    at("anchored").status = "fail";
    at("anchored").detail =
      "This payment is real, but it is not on the list the payer recorded for this run.";
    return done("proof_invalid", payment, derivedMemoId);
  }

  at("anchored").status = "pass";
  return done("verified", payment, derivedMemoId);
}
