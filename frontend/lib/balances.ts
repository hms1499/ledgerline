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

/** One try each. viem's default of three retries at ten seconds held the
 *  dashboard's Needs you for ~40 s behind a node that never answered, with
 *  no Retry on screen until the read gave up. */
export const BALANCE_TIMEOUT_MS = 10_000;

/** What one Multicall3 answer said, per token, in the order it was read:
 *  a successful call's balance, and a failed call left out entirely —
 *  unknown, never zero. This is the same rule readBalancesWith applies, so
 *  the two share their shape. */
export function balancesFromResults(
  tokens: readonly Address[],
  results: readonly { status: "success" | "failure"; result?: bigint }[],
): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  results.forEach((r, i) => {
    if (r.status === "success") out[tokens[i]!.toLowerCase()] = r.result ?? 0n;
  });
  return out;
}

/**
 * What `owner` holds of each token — every balanceOf batched into one
 * Multicall3 round-trip, so the node that delays is paid once instead of once
 * per token. A call that reverts fails alone (allowFailure keeps its
 * neighbours); when the node answered nothing at all the batch comes back
 * empty, and the dashboard's Retry covers that screen. For USDC the figure is
 * the 6-decimal ERC-20 balanceOf, never the 18-decimal native balance: the
 * two describe the same money and differ by 10^12.
 */
export async function readBalances(
  net: NetworkView, owner: Address, tokens: Address[], timeout = BALANCE_TIMEOUT_MS,
): Promise<Record<string, bigint>> {
  if (tokens.length === 0) return {};
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.defaultRpc, { timeout, retryCount: 0 }),
  });
  try {
    const results = await client.multicall({
      // allowFailure: true is viem's default — one reverting token does not
      // take the rest of the batch down with it.
      contracts: tokens.map((token) => ({
        address: token, abi: balanceOfAbi, functionName: "balanceOf", args: [owner],
      })),
    });
    return balancesFromResults(tokens, results);
  } catch {
    return {};
  }
}
