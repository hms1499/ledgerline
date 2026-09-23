import { getAddress } from "viem";
import { joinPayments } from "./join.js";
import type { Address, RawLog } from "./types.js";

export interface TokenPaid { value: bigint; payments: number }

export interface RunSummary {
  /** Per token (checksummed): emitted value and count, clean payments from `payer` only. */
  paid: Map<Address, TokenPaid>;
  /** Clean payments counted, all tokens. */
  payments: number;
  /** Payments whose memo sender ≠ transfer.from. Counted here, never summed. */
  identityBroken: number;
}

/**
 * Pure. What one run paid, read from its own logs — the emitted Transfer
 * values joined to their memos, never the amounts that were asked for
 * (invariant 5). The system emitter's duplicate USDC Transfer never reaches
 * here: decodeTransferLogs drops it.
 *
 * A payment with a broken identity is counted but not summed: a total that
 * included it would state as paid something the chain says is inconsistent.
 */
export function summarizeRun(logs: RawLog[], payer: Address): RunSummary {
  const who = payer.toLowerCase();
  const paid = new Map<Address, TokenPaid>();
  let payments = 0;
  let identityBroken = 0;

  for (const p of joinPayments(logs).payments) {
    // A payment is this payer's if either side says so: the memo sender
    // (payer) or the account that actually moved the funds (transferFrom).
    // Deciding broken-ness before this filter is what lets a payment with a
    // spoofed memo sender still get flagged instead of silently dropped.
    const mine = p.payer.toLowerCase() === who || p.transferFrom.toLowerCase() === who;
    if (!mine) continue;
    if (p.identityBroken) { identityBroken++; continue; }
    const token = getAddress(p.token);
    const prev = paid.get(token) ?? { value: 0n, payments: 0 };
    paid.set(token, { value: prev.value + p.value, payments: prev.payments + 1 });
    payments++;
  }
  return { paid, payments, identityBroken };
}

export interface TokenTotal { token: Address; value: bigint; payments: number; runs: number }

/** Every token in `tokens` appears, in that order, zero when never paid.
 *  Tokens are never pooled: there is no total across them. */
export function paidByToken(summaries: RunSummary[], tokens: Address[]): TokenTotal[] {
  return tokens.map((t) => {
    const token = getAddress(t);
    let value = 0n;
    let payments = 0;
    let runs = 0;
    for (const s of summaries) {
      const got = s.paid.get(token);
      if (!got) continue;
      value += got.value;
      payments += got.payments;
      runs++;
    }
    return { token, value, payments, runs };
  });
}
