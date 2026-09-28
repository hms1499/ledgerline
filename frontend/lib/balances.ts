import { createPublicClient, http, type Address } from "viem";
import type { NetworkView } from "@/lib/chain";

const balanceOfAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Exported for tests: the reads, with the one-token reader injected. A token
 *  whose balance cannot be read is left out, so it shows as unknown rather
 *  than as an empty wallet. */
export async function readBalancesWith(
  tokens: Address[], readOne: (token: Address) => Promise<bigint>,
): Promise<Record<string, bigint>> {
  const out: Record<string, bigint> = {};
  await Promise.all(tokens.map(async (token) => {
    try {
      out[token.toLowerCase()] = await readOne(token);
    } catch { /* unknown, not zero */ }
  }));
  return out;
}

/**
 * What `owner` holds of each token, from `balanceOf` in the token's own
 * decimals. For USDC that is the 6-decimal ERC-20 figure, never the 18-decimal
 * native balance: the two describe the same money and differ by 10^12.
 */
export function readBalances(
  net: NetworkView, owner: Address, tokens: Address[],
): Promise<Record<string, bigint>> {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  return readBalancesWith(tokens, (token) => client.readContract({
    address: token, abi: balanceOfAbi, functionName: "balanceOf", args: [owner],
  }));
}
