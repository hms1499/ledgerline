import type { RunOutcome } from "@ledgerline/core";
import { errorCode } from "@/lib/errors";

/** EIP-1193 4001: the person clicked Reject or closed the prompt. It is a
 *  choice they made, and the screen says so instead of calling it a failure. */
export const isCancelled = (err: unknown): boolean => errorCode(err) === 4001;

export const CANCELLED = {
  message: { title: "You cancelled the message in your wallet", body: "Nothing was signed and no money moved." },
  payment: { title: "You cancelled the payment in your wallet", body: "Nothing was signed and no money moved." },
};

type BlockedReason = Extract<RunOutcome, { state: "blocked" }>["reason"];

/** What each stop before signing means for the payer. The executor's own
 *  sentence is kept under Technical details. */
export const BLOCKED_COPY: Record<BlockedReason, string> = {
  chain: "Your wallet changed network before paying. Nothing was signed and no money moved. Switch back to Arc and try again.",
  balance: "The wallet no longer holds enough to pay every line. Nothing was signed and no money moved. Top it up and try again.",
  preflight: "A payment would now fail on Arc, so nothing was sent. Nothing was signed and no money moved. Go back to the check to see which one.",
  fees: "The network fee could not be set. Nothing was signed and no money moved. Try again in a moment.",
  signature: "Your wallet did not sign the payment. Nothing was signed and no money moved.",
};

export const FEE_ADVICE =
  "Your wallet will show a network fee. Keep the fee it suggests. If you change it, do not go below 25 Gwei: Arc silently drops cheaper transactions, with no error.";

export const CHECK_FAILED = "The check could not finish. Nothing was signed and no money moved.";

export const RUN_FILE_COPY =
  "This one file keeps everything: the run name, the transaction and every receipt link. Load it on the run page any time.";
