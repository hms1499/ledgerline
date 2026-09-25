import { BaseError } from "viem";
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

/** What each stop before signing certainly means for the payer, and no more.
 *  `chain` is the page's own node answering, or failing to answer, which
 *  chain it is on; `balance` is a short token, short gas, or a balance that
 *  could not be read. The executor's own sentence is kept under Technical
 *  details. */
export const BLOCKED_COPY: Record<BlockedReason, string> = {
  chain: "This page could not confirm it is connected to Arc, so it stopped before anything was sent. Nothing was signed and no money moved. Try again in a moment.",
  balance: "This page could not confirm the wallet holds enough for every line and the network fee. Nothing was signed and no money moved. Check the balances, top up anything short, and try again.",
  preflight: "A payment would now fail on Arc, so nothing was sent. Nothing was signed and no money moved. Go back to the check to see which one.",
  fees: "The network fee could not be set. Nothing was signed and no money moved. Try again in a moment.",
  signature: "Your wallet did not sign the payment. Nothing was signed and no money moved.",
};

/** Why the wallet call itself stopped, when it is something the payer can act
 *  on. Read where the wallet is called, so execute.ts decides nothing: it
 *  reports both as a failed signature. */
export type SendStop = "cancelled" | "wrong-network";

export function sendStop(err: unknown): SendStop | undefined {
  if (isCancelled(err)) return "cancelled";
  // viem asks the wallet for its chain before handing it the payment, and
  // refuses a mismatch: the wallet never prompts.
  if (err instanceof BaseError && err.walk((e) => (e as Error)?.name === "ChainMismatchError") !== null) {
    return "wrong-network";
  }
  return undefined;
}

export function blockedCopy(
  reason: BlockedReason, stop: SendStop | undefined, network: "mainnet" | "testnet",
): { title: string; body: string } {
  if (stop === "cancelled") return CANCELLED.payment;
  if (stop === "wrong-network") {
    return {
      title: "Nothing was signed",
      body: `Your wallet is on another network, so it was never asked to sign. Nothing was signed and no money moved. Switch your wallet to Arc ${network} and try again.`,
    };
  }
  return { title: "Nothing was signed", body: BLOCKED_COPY[reason] };
}

export const FEE_ADVICE =
  "Your wallet will show a network fee. Keep the fee it suggests. If you change it, do not go below 25 Gwei: Arc silently drops cheaper transactions, with no error.";

export const CHECK_FAILED = "The check could not finish. Nothing was signed and no money moved.";

export const RUN_FILE_COPY =
  "This one file keeps everything: the run name, the transaction and every receipt link. Load it on the run page any time.";
