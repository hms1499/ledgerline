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

/** EIP-6963's announcement payload. `icon` is a data URI. */
export interface WalletInfo {
  uuid: string;
  name: string;
  rdns: string;
  icon: string;
}

export interface WalletChoice {
  info: WalletInfo;
  provider: Eip1193Provider;
}

export interface ConnectedWallet {
  address: Address;
  walletClient: WalletClient;
  /** The provider actually connected to — NOT necessarily window.ethereum. */
  provider: Eip1193Provider;
  info: WalletInfo;
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<WalletChoice>;
  }
}

/**
 * `window.ethereum` is one global and every extension wants it, so with two
 * wallets installed it holds whichever won the injection race — usually not
 * the one the payer meant to use. Reading it directly is why a second wallet
 * appears not to work at all: the click opens the winner, or nothing.
 *
 * EIP-6963 replaces the race with an announcement. Every wallet that supports
 * it answers `eip6963:requestProvider` with its own provider and identity, so
 * the page can offer a choice instead of guessing.
 */
const announced = new Map<string, WalletChoice>();
const listListeners = new Set<() => void>();
let discovering = false;

function startDiscovery(): void {
  if (discovering || typeof window === "undefined") return;
  discovering = true;
  window.addEventListener("eip6963:announceProvider", (ev) => {
    const choice = ev.detail;
    if (!choice?.info?.uuid || !choice.provider) return;
    announced.set(choice.info.uuid, choice);
    for (const notify of listListeners) notify();
  });
}

function ask(): void {
  if (typeof window === "undefined") return;
  startDiscovery();
  // Wallets announce on their own at load and again on request, and an
  // extension that woke up late only answers the next ask — so asking is
  // cheap and repeatable rather than once at startup.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/**
 * Every wallet this page can see. Falls back to the injected global when
 * nothing announces, so a wallet too old for EIP-6963 still works — it just
 * cannot be told apart from any other, which is exactly the old behaviour.
 */
export function knownWallets(): WalletChoice[] {
  ask();
  if (announced.size > 0) {
    return [...announced.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
  }
  if (typeof window === "undefined") return [];

  const injected = (window as unknown as {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }).ethereum;
  if (!injected) return [];

  // Pre-6963 coexistence hack: some wallets stack themselves in an array on
  // the global instead of replacing it.
  const stacked = Array.isArray(injected.providers) ? injected.providers : [injected];
  return stacked.map((provider, i) => ({
    provider,
    info: {
      uuid: `injected-${i}`,
      name: stacked.length > 1 ? `Browser wallet ${i + 1}` : "Browser wallet",
      rdns: "",
      icon: "",
    },
  }));
}

/** Re-runs `onChange` as wallets announce themselves. */
export function watchWalletList(onChange: () => void): () => void {
  listListeners.add(onChange);
  ask();
  return () => { listListeners.delete(onChange); };
}

export async function connect(net: NetworkView, choice?: WalletChoice): Promise<ConnectedWallet> {
  const picked = choice ?? knownWallets()[0];
  if (!picked) {
    throw new Error(
      "No wallet found. Ledgerline needs a browser wallet such as MetaMask or Rabby, and the payer must sign directly — Arc's Memo contract rejects smart-contract wallets.",
    );
  }
  const provider = picked.provider;

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
  return { address, walletClient, provider, info: picked.info };
}

/**
 * There is no protocol-level "disconnect" — a page stops being connected by
 * forgetting the client it holds. But forgetting it while the wallet still
 * has the site's `eth_accounts` permission means the next connect silently
 * reattaches the same account with no prompt, which is indistinguishable from
 * a disconnect button that does nothing. EIP-2255 `wallet_revokePermissions`
 * is what makes the next connect ask again.
 *
 * Not every wallet implements it, and one that doesn't must not turn a
 * disconnect into an error: the caller clears its own state either way, so
 * the worst case is a wallet that reconnects without prompting — degraded,
 * not broken.
 */
export async function disconnect(wallet?: ConnectedWallet): Promise<void> {
  // The connected provider, never the global: revoking on window.ethereum
  // while connected to the other wallet would leave this one attached and
  // log out a wallet the payer never connected.
  const provider = wallet?.provider;
  if (!provider) return;
  try {
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch { /* unsupported, or refused; local state is the real disconnect */ }
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

/**
 * Account and chain changes invalidate everything downstream of connect.
 * Bound to the connected provider: subscribing to the global instead would
 * miss the connected wallet's own changes and fire on a wallet nobody is
 * using.
 */
export function watchWallet(wallet: ConnectedWallet, onChange: () => void): () => void {
  const provider = wallet.provider;
  if (!provider.on || !provider.removeListener) return () => {};
  const handler = () => onChange();
  provider.on("accountsChanged", handler);
  provider.on("chainChanged", handler);
  return () => {
    provider.removeListener?.("accountsChanged", handler);
    provider.removeListener?.("chainChanged", handler);
  };
}
