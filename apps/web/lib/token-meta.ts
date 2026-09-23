import { createPublicClient, http, type Address, type Chain } from "viem";
import { tokensForChain } from "@ledgerline/core";

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
