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

/** Read every token's decimals and symbol from the chain. Nothing downstream
 *  may assume 6 or 8 — that assumption is how a payout ends up off by 10^12. */
export async function readTokenMeta(
  rpc: string, chain: Chain, chainId: number,
): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }> {
  const client = createPublicClient({ chain, transport: http(rpc) });
  const tokens = tokensForChain(chainId);
  const decimals: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  await Promise.all(
    Object.values(tokens).map(async (address) => {
      const [d, s] = await Promise.all([
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
      ]);
      decimals[(address as string).toLowerCase()] = Number(d);
      symbols[(address as string).toLowerCase()] = s as string;
    }),
  );
  return { decimals, symbols };
}
