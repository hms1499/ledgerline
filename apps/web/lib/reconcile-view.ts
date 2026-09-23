import type { ReconcileStatus } from "@ledgerline/core";

/** Problems are why someone opened this page. The 97 rows that worked are not. */
export const SEVERITY: Record<ReconcileStatus, number> = {
  unlinked: 0, unpaid: 1, recipient_mismatch: 2, amount_mismatch: 3, unexpected: 4, matched: 5,
};

const LABEL: Record<ReconcileStatus, string> = {
  unlinked: "No payment behind reference",
  unpaid: "Not paid",
  recipient_mismatch: "Wrong recipient",
  amount_mismatch: "Wrong amount",
  unexpected: "Not in manifest",
  matched: "Matched",
};

const COLOR: Record<ReconcileStatus, string> = {
  unlinked: "error", unpaid: "error", recipient_mismatch: "warning",
  amount_mismatch: "warning", unexpected: "warning", matched: "success",
};

export interface StatusView {
  label: string;
  color: string;
  /** Replaces the reconciler's own note when the table's context changes it. */
  note?: string;
}

/**
 * Without a manifest the reconciler marks every payment `unexpected`, because
 * there is no intent to compare against. That is correct for the reconciler
 * and wrong for the table: shown as a warning, it contradicts a complete-run
 * verdict and tells the reader every line is suspect when none has been
 * checked. It is a payment read from the chain, and says so.
 */
export function statusView(status: ReconcileStatus, hasManifest: boolean): StatusView {
  if (status === "unexpected" && !hasManifest) {
    return {
      label: "Paid",
      color: "default",
      note: "On chain under this reference. Load the manifest to see which invoice it pays and check it against what was owed.",
    };
  }
  return { label: LABEL[status], color: COLOR[status] };
}
