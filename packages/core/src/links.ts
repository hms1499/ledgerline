import { buildTree, leafFor } from "./merkle.js";
import type { Hex, PaymentRecord } from "./types.js";

/**
 * Rebuild each payment's Merkle proof from the run's own logs, so a receipt
 * link can be issued without the payer's manifest.
 *
 * The tree is built from every payment in the order the logs carry them,
 * using the emitted value — never a remembered request. That ordering is an
 * assumption, and it is not trusted: unless the rebuilt root is the one the
 * anchor committed, this returns nothing, because a proof that verifies
 * against nothing is worse than no link at all.
 */
export function proofsFromChain(
  payments: PaymentRecord[],
  anchoredRoot: Hex | undefined,
): ((memoId: Hex) => Hex[] | undefined) | undefined {
  if (!anchoredRoot || payments.length === 0) return undefined;

  const { root, proofFor } = buildTree(
    payments.map((p) => leafFor(p.memoId, p.token, p.to, p.value)),
  );
  if (root.toLowerCase() !== anchoredRoot.toLowerCase()) return undefined;

  const index = new Map(payments.map((p, i) => [p.memoId.toLowerCase(), i]));
  return (memoId) => {
    const i = index.get(memoId.toLowerCase());
    return i === undefined ? undefined : proofFor(i);
  };
}
