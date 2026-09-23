import type { ReceiptResult } from "@ledgerline/core";

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
