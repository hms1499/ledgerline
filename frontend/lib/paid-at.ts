import { createPublicClient, http, type Chain } from "viem";

/**
 * When a payment landed, from its block's timestamp, or nothing. Read after
 * the verdict, never before it: the time is a courtesy line and the verdict is
 * the product. One try with a short limit — viem's default of three retries
 * at ten seconds each once held a receipt's verdict for 42 s behind a node
 * that never answered. A node that cannot say leaves the line off; the time
 * is never estimated.
 */
export async function readPaidAt(
  endpoint: string, chain: Chain, blockNumber: bigint, timeout = 4_000,
): Promise<bigint | undefined> {
  const client = createPublicClient({ chain, transport: http(endpoint, { retryCount: 0, timeout }) });
  try {
    return (await client.getBlock({ blockNumber })).timestamp;
  } catch {
    return undefined;
  }
}
