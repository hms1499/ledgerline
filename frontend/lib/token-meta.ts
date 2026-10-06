import { createPublicClient, http, type Address, type Chain } from "viem";
import { tokensForChain } from "@ledgerline/core";
import { formatAmount, short } from "@/lib/chain";

export interface TokenMeta { decimals?: number; symbol?: string }

/**
 * The number alone, in the token's own decimals. When those could not be
 * read, the raw integer with the token's address instead: a guessed 6 turns
 * a cirBTC amount (8 decimals) into one 100x too large, and a bare raw
 * integer next to a symbol would read as whole tokens.
 */
export function amountFigure(value: bigint, token: string, meta: TokenMeta): string {
  return meta.decimals === undefined ? `${value} (${short(token)})` : formatAmount(value, meta.decimals);
}

/** The figure with its symbol, or the same raw text when decimals are unknown. */
export function amountText(value: bigint, token: string, meta: TokenMeta): string {
  if (meta.decimals === undefined) return amountFigure(value, token, meta);
  return `${formatAmount(value, meta.decimals)} ${meta.symbol || short(token)}`;
}

/** One token's entry from records keyed by lowercased address. */
export function metaFor(
  token: string, decimals: Record<string, number>, symbols: Record<string, string>,
): TokenMeta {
  const k = token.toLowerCase();
  return { decimals: decimals[k], symbol: symbols[k] };
}

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** One try each, like the balance reads: a node that stalls must not hold a
 *  file upload hostage behind three ten-second retries. */
export const META_TIMEOUT_MS = 10_000;

/**
 * Read every token's decimals and symbol from the chain — decimals and then
 * symbols for each address, batched into one Multicall3 round-trip. A symbol
 * that does not come back is simply absent; a decimals that does not come
 * back throws, because a run must never interpret an amount in decimals no
 * one confirmed — that guess is how a payout ends up off by 10^12.
 */
export async function readTokenMeta(
  rpc: string, chain: Chain, chainId: number, timeout = META_TIMEOUT_MS,
): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }> {
  const client = createPublicClient({
    chain,
    transport: http(rpc, { timeout, retryCount: 0 }),
  });
  const tokens = tokensForChain(chainId);
  const addresses = Object.values(tokens) as Address[];
  // allowFailure: true keeps a missing symbol from taking its batch down; the
  // decimals check happens after, on the results.
  const results = await client.multicall({
    contracts: addresses.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "decimals" },
      { address, abi: erc20Abi, functionName: "symbol" },
    ]),
  });
  const decimals: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  const missing: string[] = [];
  addresses.forEach((address, i) => {
    const key = (address as string).toLowerCase();
    const d = results[i * 2];
    const s = results[i * 2 + 1];
    if (d?.status === "success") decimals[key] = Number(d.result);
    else missing.push(key);
    if (s?.status === "success" && typeof s.result === "string") symbols[key] = s.result;
  });
  if (missing.length > 0) {
    throw new Error(
      `could not read the decimals of ${missing.map(short).join(", ")} — nothing is interpreted in guessed decimals`,
    );
  }
  return { decimals, symbols };
}
