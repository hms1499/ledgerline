export interface SessionWallet { address: string; chainId: number }

export interface Session<W extends SessionWallet> {
  wallet?: W;
  /** True while a screen holds the only copy of a transaction hash. */
  held: boolean;
  /** A disconnect or account change that arrived while held. */
  forgetQueued: boolean;
}

export type SessionEvent<W> =
  | { type: "connected"; wallet: W }
  | { type: "forget" }
  | { type: "hold"; on: boolean }
  | { type: "chain"; chainId: number };

export function initialSession<W extends SessionWallet>(): Session<W> {
  return { wallet: undefined, held: false, forgetQueued: false };
}

/**
 * Between "your wallet signed it" and "here is the receipt", the send screen
 * holds the only copy of a transaction hash for money that has moved. A
 * forget during that window — the disconnect button, or the wallet switching
 * accounts — is queued and applied once the hold is released, rather than
 * refused or obeyed immediately. Moved here from CreateRun, unchanged. A
 * connect that arrives during a hold is ignored outright, since swapping the
 * wallet out from under a held hash is exactly what holding prevents.
 */
export function sessionReducer<W extends SessionWallet>(s: Session<W>, e: SessionEvent<W>): Session<W> {
  switch (e.type) {
    case "connected":
      return s.held ? s : { wallet: e.wallet, held: false, forgetQueued: false };
    case "forget":
      return s.held ? { ...s, forgetQueued: true } : { ...s, wallet: undefined, forgetQueued: false };
    case "hold":
      if (e.on) return { ...s, held: true };
      return s.forgetQueued
        ? { wallet: undefined, held: false, forgetQueued: false }
        : { ...s, held: false };
    case "chain":
      return s.wallet ? { ...s, wallet: { ...s.wallet, chainId: e.chainId } } : s;
  }
}

/**
 * A prepared run is bound to one account on one chain: the run's reference
 * code comes from that account's signature over a message that includes the
 * chain. Any change to either invalidates it — except for a confirmed run,
 * which is a fact about a block, and a run being sent, whose hash must stay.
 */
export function shouldResetPrepared(
  prev: SessionWallet | undefined,
  next: SessionWallet | undefined,
  ctx: { confirmed: boolean; held: boolean },
): boolean {
  if (ctx.confirmed || ctx.held || !prev) return false;
  if (!next) return true;
  return prev.address.toLowerCase() !== next.address.toLowerCase() || prev.chainId !== next.chainId;
}
