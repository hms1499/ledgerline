import { joinPayments } from "./join.js";
import { memoIdFor as defaultMemoIdFor } from "./memo.js";
import type {
  Hex,
  Manifest,
  PaymentRecord,
  ReconcileResult,
  ReconcileRow,
  RawLog,
} from "./types.js";

export interface ReconcileOptions {
  /** Injectable for tests and for fixtures that predate salted ids. */
  memoIdFor?: (runSalt: Hex, invoiceId: string) => Hex;
}

/**
 * Pure. No database, no network. Given the logs of one transaction and
 * optionally the manifest of intent, produce the reconciliation table.
 *
 * Without a manifest every payment is `unexpected`, because intent is unknown —
 * the caller still learns what was paid, to whom, and under which reference.
 */
export function reconcile(
  logs: RawLog[],
  manifest?: Manifest,
  options: ReconcileOptions = {},
): ReconcileResult {
  const memoIdFor = options.memoIdFor ?? defaultMemoIdFor;
  const { payments, unlinkedMemoIds } = joinPayments(logs);

  const rows: ReconcileRow[] = [];

  const unlinkedRows: ReconcileRow[] = unlinkedMemoIds.map((memoId) => ({
    status: "unlinked",
    memoId,
    token: "0x0000000000000000000000000000000000000000",
    note: "A reference exists with no payment behind it.",
  }));

  if (!manifest) {
    for (const p of payments) rows.push(unexpectedRow(p));
    return { rows: [...unlinkedRows, ...rows], payments };
  }

  const byMemoId = new Map<string, PaymentRecord>();
  for (const p of payments) byMemoId.set(p.memoId.toLowerCase(), p);

  for (const item of manifest.items) {
    const memoId = memoIdFor(manifest.runSalt, item.invoiceId);
    const payment = byMemoId.get(memoId.toLowerCase());

    if (!payment) {
      rows.push({
        status: "unpaid",
        memoId,
        token: item.token,
        invoiceId: item.invoiceId,
        expectedTo: item.to,
        expected: item.amount,
        note: "Intended, but no payment for this reference is present.",
      });
      continue;
    }

    byMemoId.delete(memoId.toLowerCase());

    const base = {
      memoId,
      token: payment.token,
      invoiceId: item.invoiceId,
      payer: payment.payer,
      to: payment.to,
      expectedTo: item.to,
      expected: item.amount,
      actual: payment.value,
    };

    if (payment.to.toLowerCase() !== item.to.toLowerCase()) {
      rows.push({ ...base, status: "recipient_mismatch" });
    } else if (payment.value !== item.amount) {
      rows.push({ ...base, status: "amount_mismatch" });
    } else {
      rows.push({ ...base, status: "matched" });
    }
  }

  for (const leftover of byMemoId.values()) rows.push(unexpectedRow(leftover));

  return { rows: [...unlinkedRows, ...rows], payments };
}

function unexpectedRow(p: PaymentRecord): ReconcileRow {
  return {
    status: "unexpected",
    memoId: p.memoId,
    token: p.token,
    payer: p.payer,
    to: p.to,
    actual: p.value,
    note: "On chain, but not on the payer's list.",
  };
}
