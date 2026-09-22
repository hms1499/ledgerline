// apps/web/lib/wallet.ts
"use client";

import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient } from "viem";
import type { NetworkView } from "@/lib/chain";

/** The subset of EIP-1193 this app uses. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface ConnectedWallet {
  address: Address;
  walletClient: WalletClient;
}

export function getProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

export async function connect(net: NetworkView): Promise<ConnectedWallet> {
  const provider = getProvider();
  if (!provider) {
    throw new Error(
      "No wallet found. Ledgerline needs a browser wallet such as MetaMask or Rabby, and the payer must sign directly — Arc's Memo contract rejects smart-contract wallets.",
    );
  }

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const address = accounts[0];
  if (!address) throw new Error("The wallet returned no account.");

  await ensureChain(provider, net);

  const walletClient = createWalletClient({
    account: address,
    chain: net.chain,
    transport: custom(provider),
  });

  await assertEoa(net, address);
  return { address, walletClient };
}

/** Switch the wallet to Arc, adding the network if it has never seen it. */
async function ensureChain(provider: Eip1193Provider, net: NetworkView): Promise<void> {
  const hex = `0x${net.chain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    // 4902: the wallet does not know this chain yet.
    const code = (err as { code?: number }).code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: net.chain.name,
        nativeCurrency: net.chain.nativeCurrency,
        rpcUrls: [net.defaultRpc],
        blockExplorerUrls: [net.explorer],
      }],
    });
  }
}

/**
 * Thrown only by assertEoa's EOA-only rejection, so a caller can tell "this
 * wallet genuinely cannot sign a Ledgerline run" apart from any other
 * connection failure (a dropped RPC, a rejected chain switch, ...) without
 * matching on message text — that text is product copy and free to change.
 */
export class EoaRequiredError extends Error {}

/**
 * Arc's Memo predeploy reverts for contract callers with "sender spoofing
 * requires tx.origin as sender" — measured on testnet, since eth_call and
 * debug_traceCall force msg.sender == tx.origin and cannot test the rule.
 *
 * Catching it here costs a read. Letting it through costs the payer a signed
 * transaction and its gas, for a run that was always going to revert.
 */
export async function assertEoa(net: NetworkView, address: Address): Promise<void> {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  const code = await client.getCode({ address });
  if (!code || code === "0x") return;

  // An EOA carrying an EIP-7702 delegation has code but is still an EOA with a
  // valid tx.origin. [unverified] whether Arc enables 7702; the guard prevents
  // a false rejection if it does.
  if (code.toLowerCase().startsWith("0xef0100")) return;

  throw new EoaRequiredError(
    "This address is a smart-contract wallet. Arc's Memo contract requires the payer to be the transaction's origin, so Safe, ERC-4337 and similar wallets cannot sign a Ledgerline run. Connect an ordinary EOA instead.",
  );
}

/** Account and chain changes invalidate everything downstream of connect. */
export function watchWallet(onChange: () => void): () => void {
  const provider = getProvider();
  if (!provider?.on || !provider.removeListener) return () => {};
  const handler = () => onChange();
  provider.on("accountsChanged", handler);
  provider.on("chainChanged", handler);
  return () => {
    provider.removeListener?.("accountsChanged", handler);
    provider.removeListener?.("chainChanged", handler);
  };
}
