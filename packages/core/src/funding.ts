import type { Address } from "./types.js";

/**
 * What a run needs, per token and never pooled: 1 EURC is not 1 USDC, and a
 * total across tokens is a number that means nothing. Keyed
 * case-insensitively, because a checksummed and a lowercase copy of one
 * address are one token, and counting them twice would halve the shortfall.
 */
export function totalsByToken(
  items: readonly { token: Address; amount: bigint }[],
): { token: Address; need: bigint }[] {
  const totals = new Map<string, { token: Address; need: bigint }>();
  for (const { token, amount } of items) {
    const key = token.toLowerCase();
    const line = totals.get(key);
    if (line) line.need += amount;
    else totals.set(key, { token, need: amount });
  }
  return [...totals.values()];
}

export interface FundingLine {
  token: Address;
  need: bigint;
  /** Undefined when the balance could not be read — unknown, not zero. */
  hold?: bigint;
  /** How much more is needed. 0n when covered, or when `hold` is unknown. */
  short: bigint;
}

/**
 * Whether a wallet covers a run, token by token, from balances already read
 * (keyed by lowercase address, in each token's own base units). Pure, so the
 * preview can say "short by 2 EURC" before anything is signed, and the rule
 * is the same one the executor enforces before it signs.
 */
export function fundingFor(
  items: readonly { token: Address; amount: bigint }[],
  balances: Readonly<Record<string, bigint | undefined>>,
): FundingLine[] {
  return totalsByToken(items).map(({ token, need }) => {
    const hold = balances[token.toLowerCase()];
    return { token, need, hold, short: hold !== undefined && hold < need ? need - hold : 0n };
  });
}
