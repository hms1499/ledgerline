/**
 * One resolver for both Arc networks, so the script that runs on mainnet is
 * byte-for-byte the script already rehearsed on testnet. Two near-identical
 * scripts drift, and the moment they drift is the moment real money moves.
 */
import { arc, arcTestnet } from "viem/chains";
import { tokensForChain, type TokenSet } from "@ledgerline/core";
import type { Chain } from "viem";

export interface NetworkConfig {
  name: "mainnet" | "testnet";
  chain: Chain;
  rpcUrl: string;
  anchor: `0x${string}`;
  tokens: TokenSet;
  explorer: string;
  isMainnet: boolean;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function resolveNetwork(): NetworkConfig {
  const idx = process.argv.indexOf("--network");
  // No default. A script that moves money should never pick a network on its
  // own: a silent testnet default would rehearse what the author meant to pay,
  // and a silent mainnet default would pay what they meant to rehearse.
  const raw = idx >= 0 ? process.argv[idx + 1] : process.env.NETWORK;
  if (raw === undefined) {
    throw new Error(`pass --network mainnet or --network testnet (add --dry-run to check without signing)`);
  }

  if (raw !== "mainnet" && raw !== "testnet") {
    throw new Error(`--network must be "mainnet" or "testnet", got "${raw}"`);
  }

  const isMainnet = raw === "mainnet";
  const chain = isMainnet ? arc : arcTestnet;

  const anchor = (isMainnet ? process.env.ANCHOR_MAINNET : process.env.ANCHOR_TESTNET) as
    | `0x${string}`
    | undefined;
  if (!anchor) {
    throw new Error(`${isMainnet ? "ANCHOR_MAINNET" : "ANCHOR_TESTNET"} is not set in .env`);
  }

  return {
    name: raw,
    chain,
    rpcUrl:
      (isMainnet ? process.env.ARC_MAINNET_RPC : process.env.ARC_TESTNET_RPC) ||
      (isMainnet ? "https://rpc.mainnet.arc.io" : "https://arc-testnet.drpc.org"),
    anchor,
    tokens: tokensForChain(chain.id),
    explorer: isMainnet ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io",
    isMainnet,
  };
}

/** Fail loudly before anything is signed if the chain is not what was asked for. */
export async function assertChainId(
  actual: number,
  expected: NetworkConfig,
): Promise<void> {
  if (actual !== expected.chain.id) {
    throw new Error(
      `RPC ${expected.rpcUrl} reports chain ${actual}, but --network ${expected.name} expects ${expected.chain.id}`,
    );
  }
}
