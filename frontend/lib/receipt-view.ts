import type { ReceiptResult, ReceiptState } from "@ledgerline/core";

/**
 * The headline in the amount slot when the page has no payment to show. Each
 * is a different claim: "no payment" is something the chain said, while an
 * incomplete link means the chain was never asked about this invoice.
 */
export function absentHeadline(result: ReceiptResult): string {
  switch (result.state) {
    case "bad_link": return "Cannot be checked";
    case "run_reverted": return "Nothing was paid";
    default: return "No payment found";
  }
}

/**
 * The receipt page's verdict for each outcome, written for the person being
 * paid: what the chain says, and what to do if something is wrong. The
 * protocol's words (anchor, manifest, salt) stay out of it.
 */
export const RECEIPT_COPY: Record<ReceiptState, { headline: string; body: string; tone: string }> = {
  verified: {
    tone: "ok", headline: "Verified",
    body: "Five checks against the chain, all passed. Nothing here depends on Ledgerline.",
  },
  verified_unanchored: {
    tone: "degraded", headline: "Payment verified",
    body: "The payment is real and carries this invoice reference. One thing was not checked: whether it is on the list the payer recorded for this run, because this link does not carry the proof for it.",
  },
  not_anchored: {
    tone: "degraded", headline: "Payment verified",
    body: "The payment is real. The payer never recorded a list for this run, so there is no list to check it against.",
  },
  proof_invalid: {
    tone: "error", headline: "Paid, but not on the payer's list",
    body: "The payment happened, but it is not on the list the payer recorded for this run, so it is unaccounted for.",
  },
  run_reverted: {
    tone: "error", headline: "This payout did not execute",
    body: "The transaction reverted. No money moved and nothing was paid.",
  },
  memo_absent: {
    tone: "error", headline: "No payment for this invoice",
    body: "The transaction exists, but nothing in it carries this invoice reference. The link may be for a different invoice or a different run.",
  },
  unlinked: {
    tone: "critical", headline: "Anomaly: reference with no payment",
    body: "This invoice reference is on chain, but no payment satisfies it. Keep this link and contact the payer.",
  },
  identity_broken: {
    tone: "critical", headline: "Sender does not match the payer",
    body: "The address on record as the payer is not the address the funds came from. Do not treat this as settled.",
  },
  bad_link: {
    tone: "error", headline: "This link is incomplete",
    body: "Some of the evidence is missing from the address bar, so the checks cannot run. Ask the payer to resend the link.",
  },
};
