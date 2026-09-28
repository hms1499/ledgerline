import { short } from "@/lib/chain";

/**
 * What rebuilding receipt links can do right now, from the page's one wallet
 * session. The links come from the paying wallet's signature, so only that
 * account can rebuild them. Saying so before the click spares the payer a
 * signature prompt that could only end in "these do not match".
 */
export type RecoverGate =
  | { kind: "connect" }
  | { kind: "wrong_wallet"; connected: string; payer: string }
  | { kind: "ready" };

export function recoverGate(connected: string | undefined, anchorPayer: string | undefined): RecoverGate {
  if (!connected) return { kind: "connect" };
  // Without the payer on record there is nothing to compare against; the
  // chain check after signing still refuses links from the wrong account.
  if (anchorPayer && connected.toLowerCase() !== anchorPayer.toLowerCase()) {
    return { kind: "wrong_wallet", connected, payer: anchorPayer };
  }
  return { kind: "ready" };
}

export function wrongWalletText(g: Extract<RecoverGate, { kind: "wrong_wallet" }>): { title: string; body: string } {
  return {
    title: "This wallet did not pay this run",
    body: `The connected account is ${short(g.connected)}; the run was paid by ${short(g.payer)}. Only that account can rebuild these links, because their reference code comes from its signature. Switch to that account in your wallet, then connect again.`,
  };
}
