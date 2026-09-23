import { explainCallFailure, type Hex } from "@ledgerline/core";

export interface PreflightRow {
  label: string;
  ok: boolean;
  /** Why it would fail, in plain words. Absent when it would succeed. */
  reason?: string;
  /** The token's own words, kept when `reason` rewords them. */
  detail?: string;
}

/**
 * One line per call in the simulated run: call zero records the list on chain
 * (the anchor commit), the rest are payments in manifest order. A failed line
 * carries its reason, so the payer can fix it rather than guess at it.
 */
export function preflightRows(
  outcomes: { success: boolean; returnData: Hex }[],
  invoiceIds: string[],
): PreflightRow[] {
  return outcomes.map((o, i) => {
    const label = i === 0 ? "Record the list on chain" : invoiceIds[i - 1]!;
    if (o.success) return { label, ok: true };
    const { message, detail } = explainCallFailure(o.returnData);
    return { label, ok: false, reason: message, detail };
  });
}
