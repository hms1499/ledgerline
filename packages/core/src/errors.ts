import { decodeAbiParameters, keccak256, toHex } from "viem";
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
      "This exact list has already been paid by this wallet under this run name, so it " +
      "was refused — a repeat payment is blocked on chain, not just on this screen. If this " +
      "is a later period paying the same amounts, give it its own run name. If you are " +
      "correcting the list, changing any line already makes it a new run.",
  },
  [EMPTY_RUN_SELECTOR]: {
    name: "EmptyRun",
    message: "The run has no payments to record.",
  },
};

/** Memo's wrapper around a failed inner call. Measured on Arc testnet: a
 *  transfer that reverts inside Memo surfaces as MemoFailed(bytes), with the
 *  token's own revert data as the argument. */
const MEMO_FAILED_SELECTOR: Hex = selectorOf("MemoFailed(bytes)");
const ERROR_STRING_SELECTOR: Hex = selectorOf("Error(string)");

/**
 * Token reasons with a plainer explanation. Only strings actually seen on Arc
 * are listed; anything else is passed through verbatim, because a guessed
 * reason for a refused payment is worse than the token's own words.
 */
const TOKEN_REASONS: { match: RegExp; message: string }[] = [
  {
    // Measured on Arc testnet from an unfunded payer, for USDC, EURC and cirBTC.
    match: /transfer amount exceeds balance/i,
    message: "The paying wallet does not hold enough of this token to cover this payment.",
  },
];

/**
 * Why one call in a preflight failed, from the returnData Multicall3From
 * hands back for it. Unwraps Memo's MemoFailed(bytes) to reach the token's
 * own reason. `detail` keeps the raw reason whenever the message rewords it.
 */
export function explainCallFailure(data: Hex): { message: string; detail?: string } {
  const selector = data.slice(0, 10).toLowerCase();

  if (data.length < 10) {
    return { message: "The payment failed without giving a reason." };
  }
  const unrecognised = { message: `The payment failed with an unrecognised error: ${selector}` };
  try {
    if (selector === MEMO_FAILED_SELECTOR) {
      const [inner] = decodeAbiParameters([{ type: "bytes" }], `0x${data.slice(10)}`);
      return explainCallFailure(inner);
    }
    if (selector === ERROR_STRING_SELECTOR) {
      const [reason] = decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`);
      const known = TOKEN_REASONS.find((r) => r.match.test(reason));
      return known
        ? { message: known.message, detail: reason }
        : { message: `The token refused this transfer: ${reason}` };
    }
  } catch {
    // A payload that does not decode is reported by its selector, not thrown:
    // one unreadable row must not take the whole preflight screen with it.
    return unrecognised;
  }
  const anchorError = KNOWN[selector];
  if (anchorError) return { message: anchorError.message };

  return unrecognised;
}

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
