import { keccak256 } from "viem";
import type { Hex } from "./types.js";

/**
 * The run salt is derived from the payer's own signature over the run label.
 *
 * It replaces a public constant string, which any observer could recompute —
 * and since memoId = keccak(salt ‖ invoiceId) over conventional invoice ids,
 * that let anyone reading the chain rebuild who paid whom, defeating exactly
 * the property memo.ts advertises.
 *
 * A random salt would fix that and introduce a worse failure: held only in
 * browser memory, closing the tab would destroy every recipient's ability to
 * verify, permanently. A signature is unguessable to observers AND
 * reproducible by the payer, with nothing stored anywhere.
 *
 * This leans on deterministic ECDSA. [measured] viem's local signer is
 * deterministic; browser wallets sign with their own implementations and are
 * [unverified]. Nothing here assumes it — the recovery path re-derives and
 * then checks against the memoIds actually in the transaction's logs.
 */

/** Collapse whitespace so a trailing space typed on the recovery screen
 *  cannot silently produce a different salt. Case is kept: a label is shown
 *  to people, and lowercasing it would make recovery lossy in the other
 *  direction. */
export function normalizeRunLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, " ");
  if (normalized === "") {
    throw new Error(
      "runLabel must not be empty — it is what separates this run's references from every other run's",
    );
  }
  return normalized;
}

/** The exact message the payer signs. Changing it changes every future salt,
 *  which is why it carries an explicit v1. */
export function saltMessageFor(chainId: number, runLabel: string): string {
  return `ledgerline-run-salt:v1:${chainId}:${normalizeRunLabel(runLabel)}`;
}

export function saltFromSignature(signature: Hex): Hex {
  return keccak256(signature);
}
