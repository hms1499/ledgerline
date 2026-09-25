import { MAX_ITEMS_PER_RUN } from "./build.js";
import type { ResolvedRow } from "./csv.js";

export interface RowIssue {
  line?: number;
  invoiceId?: string;
  message: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Everything checkable without the network, reported all at once.
 *
 * Arrays, never throws: fixing a 400-row payroll one error per attempt is
 * unusable. buildRun keeps its own throws — they are the last guard for a
 * caller reaching it directly, not a duplicate of this.
 *
 * Per-token balances and Arc's runtime blocklist need the chain and belong to
 * preflight, not here.
 */
export function validateRun(items: ResolvedRow[]): {
  errors: RowIssue[];
  warnings: RowIssue[];
} {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  if (items.length === 0) {
    return { errors: [{ message: "This file has no payments in it." }], warnings };
  }

  if (items.length > MAX_ITEMS_PER_RUN) {
    errors.push({
      message: `This run has ${items.length} rows; the limit is ${MAX_ITEMS_PER_RUN}, to stay under Arc's block gas limit. Split it into separate files.`,
    });
  }

  const invoiceLine = new Map<string, number>();
  // Keyed by recipient AND token: this rule exists to catch a duplicated
  // paste, and the same person paid in two different tokens is not that.
  const paidLine = new Map<string, number>();

  for (const item of items) {
    if (item.to.toLowerCase() === ZERO) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: "This pays 0x0000…0000, an address nobody owns. Arc refuses the payment. Check the recipient.",
      });
    }

    const seenInvoice = invoiceLine.get(item.invoiceId);
    if (seenInvoice !== undefined) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `Invoice "${item.invoiceId}" is also on line ${seenInvoice}. Give each payment its own invoice reference, or the two cannot be told apart.`,
      });
    } else {
      invoiceLine.set(item.invoiceId, item.line);
    }

    const pair = `${item.to.toLowerCase()}|${item.token.toLowerCase()}`;
    const seenPair = paidLine.get(pair);
    if (seenPair !== undefined) {
      warnings.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `This recipient was already paid on line ${seenPair}, in the same token. Two invoices to one person is valid — check it is not the same one twice.`,
      });
    } else {
      paidLine.set(pair, item.line);
    }
  }

  return { errors, warnings };
}
