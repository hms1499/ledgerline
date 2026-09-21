export type CompletenessVerdict = "complete" | "incomplete" | "over" | "unknown";

export interface CompletenessInput {
  /** `itemCount` from PayoutAnchor.runs, when a run was committed. */
  anchoredItemCount?: number;
  /** Payments successfully joined to a reference. */
  paymentsFound: number;
  /** References with no payment behind them. Never counted as paid. */
  unlinkedCount?: number;
}

export interface Completeness {
  verdict: CompletenessVerdict;
  anchored?: number;
  found: number;
  missing: number;
  surplus: number;
  note: string;
}

/**
 * Was the whole run paid?
 *
 * This is answerable **without the manifest**, which is why `itemCount` is a
 * stored field on PayoutAnchor rather than an afterthought. A recipient holding
 * nothing but the link can see that a run committed to five payments and only
 * three arrived — and they learn it from the chain, not from the payer.
 *
 * It is a count, not a reconciliation: it says how many are missing, never
 * which. Naming them needs the manifest.
 */
export function assessCompleteness(input: CompletenessInput): Completeness {
  const { anchoredItemCount, paymentsFound } = input;
  const unlinked = input.unlinkedCount ?? 0;

  // Zero is not "an anchored run of no items" — commit() rejects that — so it
  // can only mean no anchor was found.
  if (!anchoredItemCount) {
    return {
      verdict: "unknown",
      found: paymentsFound,
      missing: 0,
      surplus: 0,
      note: "No anchored run was found for this transaction, so there is no committed total to check the payments against.",
    };
  }

  const missing = Math.max(0, anchoredItemCount - paymentsFound);
  const surplus = Math.max(0, paymentsFound - anchoredItemCount);

  const unlinkedNote = unlinked
    ? ` ${unlinked} reference${unlinked === 1 ? "" : "s"} on chain ${unlinked === 1 ? "has" : "have"} no payment behind ${unlinked === 1 ? "it" : "them"} and ${unlinked === 1 ? "does" : "do"} not count as paid.`
    : "";

  if (missing > 0) {
    return {
      verdict: "incomplete",
      anchored: anchoredItemCount,
      found: paymentsFound,
      missing,
      surplus: 0,
      note: `The payer committed to ${anchoredItemCount} payments and ${paymentsFound} are present, so ${missing} ${missing === 1 ? "is" : "are"} missing.${unlinkedNote}`,
    };
  }

  if (surplus > 0) {
    return {
      verdict: "over",
      anchored: anchoredItemCount,
      found: paymentsFound,
      missing: 0,
      surplus,
      note: `${paymentsFound} payments are present but only ${anchoredItemCount} were committed to, so ${surplus} ${surplus === 1 ? "is" : "are"} outside the manifest.${unlinkedNote}`,
    };
  }

  return {
    verdict: "complete",
    anchored: anchoredItemCount,
    found: paymentsFound,
    missing: 0,
    surplus: 0,
    note: `All ${anchoredItemCount} committed payments are present.${unlinkedNote}`,
  };
}

import { buildTree, leafFor } from "./merkle.js";
import { memoIdFor } from "./memo.js";
import type { Hex, Manifest } from "./types.js";

export interface ManifestCheck {
  /** undefined when there is no anchored root to compare against. */
  matches?: boolean;
  computedRoot?: Hex;
  anchoredRoot?: Hex;
  note: string;
}

/**
 * Is this manifest the one that was committed on chain?
 *
 * A manifest arrives from the payer, which makes it the one piece of evidence
 * on the reconciliation screen that is not self-verifying. Rebuilding its
 * Merkle root and comparing settles it: the anchored root is a commitment to
 * the exact list, so any added line, altered amount or swapped salt produces a
 * different root.
 *
 * Without this, a payer could hand over a manifest that matches what they
 * paid rather than what they promised, and the table would agree with them.
 */
export function checkManifestAgainstRoot(
  manifest: Manifest,
  anchoredRoot?: Hex,
): ManifestCheck {
  if (!anchoredRoot || /^0x0*$/.test(anchoredRoot)) {
    return {
      note: "No anchored root was found for this run, so this manifest cannot be checked against what was committed.",
    };
  }

  if (manifest.items.length === 0) {
    return {
      matches: false,
      anchoredRoot,
      note: "This manifest lists no payments, so it cannot be the one that was committed.",
    };
  }

  try {
    const computedRoot = buildTree(
      manifest.items.map((i) =>
        leafFor(memoIdFor(manifest.runSalt, i.invoiceId), i.token, i.to, i.amount),
      ),
    ).root;

    const matches = computedRoot.toLowerCase() === anchoredRoot.toLowerCase();
    return {
      matches,
      computedRoot,
      anchoredRoot,
      note: matches
        ? "This manifest rebuilds the root committed on chain, so it is the list the payer committed to."
        : "This manifest does not rebuild the root committed on chain. It is not the list that was committed — a line, an amount or the salt differs.",
    };
  } catch {
    return {
      matches: false,
      anchoredRoot,
      note: "This manifest could not be read well enough to rebuild a root.",
    };
  }
}
