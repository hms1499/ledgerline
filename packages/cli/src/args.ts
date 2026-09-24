import type { Address } from "@ledgerline/core";

export type Network = "mainnet" | "testnet";

const RPC: Record<Network, string> = {
  mainnet: "https://rpc.mainnet.arc.io",
  testnet: "https://rpc.testnet.arc.io",
};

/**
 * The PayoutAnchor whose RunCommitted events this tool trusts. Any contract can
 * emit that event, so the address has to come from here or from --anchor,
 * never from the transaction being checked. Mainnet is filled in at deploy.
 */
const KNOWN_ANCHOR: Record<Network, Address | undefined> = {
  mainnet: undefined,
  testnet: "0xb8907A07768D936D1D498257E5803c91033a8802",
};

export const USAGE =
  "usage: arc-reconcile <txHash> [--network mainnet|testnet] [--rpc <url>] [--anchor <address>] [--manifest <run file>]";

export interface CliArgs {
  txHash: `0x${string}`;
  network: Network;
  rpcUrl: string;
  anchor?: Address;
  manifestPath?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const txHash = argv[0];
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error(USAGE);

  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const network = valueOf("--network") ?? "mainnet";
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error(`--network must be "mainnet" or "testnet", got "${network}"`);
  }

  return {
    txHash: txHash as `0x${string}`,
    network,
    rpcUrl: valueOf("--rpc") ?? RPC[network],
    anchor: (valueOf("--anchor") as Address | undefined) ?? KNOWN_ANCHOR[network],
    manifestPath: valueOf("--manifest"),
  };
}
