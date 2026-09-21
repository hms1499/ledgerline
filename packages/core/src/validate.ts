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
    return { errors: [{ message: "This file has no rows to pay." }], warnings };
  }

  if (items.length > MAX_ITEMS_PER_RUN) {
    errors.push({
      message: `This run has ${items.length} rows; the limit is ${MAX_ITEMS_PER_RUN}, to stay under Arc's block gas limit. Split it into separate files.`,
    });
  }

  const invoiceLine = new Map<string, number>();
  const recipientLine = new Map<string, number>();

  for (const item of items) {
    if (item.to.toLowerCase() === ZERO) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: "Pays the zero address. Arc reverts on this, and burning a payroll is not a thing this tool will do.",
      });
    }

    const seenInvoice = invoiceLine.get(item.invoiceId);
    if (seenInvoice !== undefined) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `Invoice "${item.invoiceId}" already appears on line ${seenInvoice}. Two payments under one reference cannot be told apart when reconciling.`,
      });
    } else {
      invoiceLine.set(item.invoiceId, item.line);
    }

    const to = item.to.toLowerCase();
    const seenRecipient = recipientLine.get(to);
    if (seenRecipient !== undefined) {
      warnings.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `Also paid on line ${seenRecipient}. Two invoices to one recipient is valid — check it is intended.`,
      });
    } else {
      recipientLine.set(to, item.line);
    }
  }

  return { errors, warnings };
}
