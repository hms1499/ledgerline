import { EoaRequiredError } from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";

/** The title and body of a connect-failure Alert. Kept together so the two
 *  can never drift apart the way a bare string once let them. */
export interface ConnectError {
  /** "info" for an outcome that says nothing about the wallet itself;
   *  "error" for a genuine reason this wallet cannot sign a Ledgerline run. */
  type: "info" | "error";
  title: string;
  description: string;
}

/**
 * Three cases, each with its own title, because a title is a claim and only
 * one of these three is a claim about the wallet's compatibility:
 *
 * - A dismissed wallet prompt (EIP-1193 code 4001) is the ordinary, expected
 *   outcome of asking someone to connect. It says nothing about the wallet.
 * - `EoaRequiredError` is the one genuine, deliberate compatibility claim —
 *   assertEoa found real contract code at the address, so this wallet truly
 *   cannot sign a Ledgerline run. Checked by type, not by matching the
 *   message text, which is product copy and free to change.
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
