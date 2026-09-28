import { ArcUnreachableError, EoaRequiredError } from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";
import { short } from "@/lib/chain";

/** The title and body of a connect-failure Alert. Kept together so the two
 *  can never drift apart the way a bare string once let them. */
export interface ConnectError {
  /** "info" for an outcome that says nothing about the wallet itself;
   *  "error" for a genuine reason this wallet cannot sign a Ledgerline run. */
  type: "info" | "error";
  title: string;
  description: string;
  /** What the node or wallet actually said, for Technical details. */
  detail?: string;
}

/**
 * Four cases, each with its own title, because a title is a claim and only
 * one of these three is a claim about the wallet's compatibility:
 *
 * - A dismissed wallet prompt (EIP-1193 code 4001) is the ordinary, expected
 *   outcome of asking someone to connect. It says nothing about the wallet.
 * - `EoaRequiredError` is the one genuine, deliberate compatibility claim —
 *   assertEoa found real contract code at the address, so this wallet truly
 *   cannot sign a Ledgerline run. Checked by type, not by matching the
 *   message text, which is product copy and free to change.
 * - `ArcUnreachableError` is the page's own read of Arc failing after the
 *   wallet answered. It names Arc, never the wallet.
 * - Everything else (no injected provider, a dropped RPC, a rejected chain
 *   switch that isn't 4001, ...) is a connection that failed for a reason
 *   that has nothing to do with wallet compatibility, and must not be
 *   reported as though it did.
 */
export function describeConnectError(err: unknown): ConnectError {
  // Read through the nesting: a wallet's 4001 is often wrapped by whatever
  // called it, and a dismissal misread as a failure accuses the wallet of
  // something it did not do.
  if (errorCode(err) === 4001) {
    return {
      type: "info",
      title: "Connection cancelled",
      description: "Click connect again when you're ready.",
    };
  }
  if (err instanceof ArcUnreachableError) {
    return {
      type: "error",
      title: "Couldn't reach Arc",
      description: `Your wallet answered, but this page could not reach Arc ${err.network} to check your account. Nothing was signed. Try again in a moment.`,
      detail: err.reason,
    };
  }
  if (err instanceof EoaRequiredError) {
    return {
      type: "error",
      title: "This wallet cannot sign a Ledgerline run",
      description: err.message,
    };
  }
  return {
    type: "error",
    title: "Couldn't connect to your wallet",
    description: describeError(err),
  };
}

/**
 * Why the page just disconnected on its own. A change of account ends the
 * session rather than following it, because a run prepared here is bound to
 * the account that signed its reference code; dropping it without a word left
 * the payer at "Connect wallet", and on /new back at Review, with no idea why.
 * "info", not "error": nothing is wrong with the wallet.
 */
export function accountLostNotice(next?: string): ConnectError {
  const again = "If you were about to pay, the run goes back to Review and is checked again.";
  return next
    ? {
      type: "info",
      title: "Your wallet switched accounts",
      description: `It now offers ${short(next)}, so this page disconnected rather than sign with an account you did not choose here. Connect again to use it. ${again}`,
    }
    : {
      type: "info",
      title: "Your wallet stopped sharing an account",
      description: `It locked, or no longer lets this page see an account, so this page disconnected. Connect again to continue. ${again}`,
    };
}
