import { keccak256, toHex } from "viem";
import type { Hex } from "./types.js";

/**
 * PayoutAnchor's custom errors, derived from their signatures rather than
 * pasted in. A hand-copied selector is exactly the kind of thing that is
 * wrong for weeks without anyone noticing, because the failure path is the
 * one nobody exercises.
 */
function selectorOf(signature: string): Hex {
  return keccak256(toHex(signature)).slice(0, 10) as Hex;
}

export const RUN_EXISTS_SELECTOR: Hex = selectorOf("RunExists()");
export const EMPTY_RUN_SELECTOR: Hex = selectorOf("EmptyRun()");

const KNOWN: Record<string, { name: string; message: string }> = {
  [RUN_EXISTS_SELECTOR]: {
    name: "RunExists",
    message:
      "This exact payout list has already been committed by this payer, so it was refused. " +
      "Double payment is blocked at the contract layer, not in the UI. " +
      "If you meant to pay again, change the list — a corrected run is a new run.",
  },
  [EMPTY_RUN_SELECTOR]: {
    name: "EmptyRun",
    message: "The run committed an empty Merkle root or zero items.",
  },
};

/**
 * Pull the raw revert data out of whatever shape the client wrapped it in.
 * viem nests the RPC error several `cause` levels deep and sometimes puts the
 * payload under `data.data`, so this walks rather than reaching for one path.
 */
export function extractRevertData(err: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  let node: unknown = err;

  while (node && typeof node === "object" && !seen.has(node)) {
    seen.add(node);
    const record = node as Record<string, unknown>;

    const data = record.data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]*$/.test(data) && data.length >= 10) {
      return data as Hex;
    }
    if (data && typeof data === "object") {
      const inner = (data as Record<string, unknown>).data;
      if (typeof inner === "string" && /^0x[0-9a-fA-F]*$/.test(inner) && inner.length >= 10) {
        return inner as Hex;
      }
    }

    node = record.cause;
  }

  return undefined;
}

/**
 * Turn a failed call into something a human can act on. An unknown selector is
 * reported as unknown rather than guessed at — reporting the wrong reason for
 * a refused payout is worse than reporting none.
 */
export function explainRevert(err: unknown): { name?: string; message: string } {
  const data = extractRevertData(err);

  if (data) {
    const known = KNOWN[data.slice(0, 10).toLowerCase()];
    if (known) return known;
    return { message: `Reverted with an unrecognised error: ${data.slice(0, 10)}` };
  }

  return { message: err instanceof Error ? err.message : String(err) };
}
