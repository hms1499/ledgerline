// frontend/lib/wallet.ts
"use client";

import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient } from "viem";
import type { NetworkView } from "@/lib/chain";
import { errorCode } from "@/lib/errors";

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
  /** The chain the wallet is actually on right now — not the one we want.
   *  Connecting never forces a switch, so this can legitimately be wrong,
   *  and the screen offers switchChain() rather than failing the connect. */
  chainId: number;
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
/** Cached so repeated reads keep array identity and do not re-render. */
let snapshot: WalletChoice[] = [];

function startDiscovery(): void {
  if (discovering || typeof window === "undefined") return;
  discovering = true;
  window.addEventListener("eip6963:announceProvider", (ev) => {
    const choice = ev.detail;
    if (!choice?.info?.uuid || !choice.provider) return;
    // A wallet re-announcing something already on the list is not news, and
    // treating it as news is how this turns into an endless storm: notify →
    // subscriber re-renders → subscriber reads the list → read asks again →
    // every wallet announces again. Some wallets also reassign
    // window.ethereum when they answer, which two wallets cannot both do, so
    // that storm shows up as a flood of extension errors and a hung page.
    if (announced.get(choice.info.uuid)?.provider === choice.provider) return;
    announced.set(choice.info.uuid, choice);
    snapshot = [...announced.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
    for (const notify of listListeners) notify();
  });
}

/**
 * Ask every installed wallet to announce itself. Deliberately separate from
 * reading the list: asking inside the read is what created the loop above.
 * One ask is enough, because EIP-6963 requires a wallet to announce on its
 * own initialisation as well as on request, so one that loads late still
 * arrives without being asked again.
 */
export function requestWallets(): void {
  if (typeof window === "undefined") return;
  startDiscovery();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** The injected global, if reading it is even safe. Two wallets fighting over
 *  the property can leave a getter that throws. */
function injectedGlobal(): (Eip1193Provider & { providers?: Eip1193Provider[] }) | undefined {
  try {
    return (window as unknown as {
      ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    }).ethereum;
  } catch { return undefined; }
}

let injectedSnapshot: WalletChoice[] | undefined;

/**
 * Every wallet this page can see, as a snapshot. Never dispatches. Falls back
 * to the injected global when nothing announced, so a wallet too old for
 * EIP-6963 still works — it just cannot be told apart from any other, which
 * is exactly the old behaviour.
 */
export function knownWallets(): WalletChoice[] {
  // Attaching the listener here is safe and makes the module hard to misuse:
  // it was dispatching from inside the read that closed the announce loop,
  // never listening. A caller that reads before anyone asked still needs
  // requestWallets() to have run, which is what watchWalletList does.
  startDiscovery();
  if (snapshot.length > 0) return snapshot;
  if (typeof window === "undefined") return [];
  if (injectedSnapshot) return injectedSnapshot;

  const injected = injectedGlobal();
  if (!injected) return [];

  // Pre-6963 coexistence hack: some wallets stack themselves in an array on
  // the global instead of replacing it.
  const stacked = Array.isArray(injected.providers) ? injected.providers : [injected];
  injectedSnapshot = stacked.map((provider, i) => ({
    provider,
    info: {
      uuid: `injected-${i}`,
      name: stacked.length > 1 ? `Browser wallet ${i + 1}` : "Browser wallet",
      rdns: "",
      icon: "",
    },
  }));
  return injectedSnapshot;
}

/** Re-runs `onChange` as wallets announce themselves. */
export function watchWalletList(onChange: () => void): () => void {
  listListeners.add(onChange);
  requestWallets();
  return () => { listListeners.delete(onChange); };
}

export async function connect(net: NetworkView, choice?: WalletChoice): Promise<ConnectedWallet> {
  const picked = choice ?? knownWallets()[0];
  if (!picked) {
    throw new NoWalletError("No wallet found in this browser.");
  }
  const provider = picked.provider;

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const address = accounts[0];
  if (!address) throw new Error("The wallet returned no account.");

  // Deliberately NOT switching the chain here. Wallets disagree about what
  // wallet_switchEthereumChain means during a connect — some prompt, some
  // apply it silently, Rabby scopes the chain to the site instead — so a
  // connect that depends on it fails differently in every wallet, and fails
  // completely when the payer dismisses a prompt they did not ask for.
  // Connecting reports which chain the wallet is on; switching is its own
  // button, with its own prompt, that the payer chose to press.
  const chainId = await readChainId(provider);

  const walletClient = createWalletClient({
    account: address,
    chain: net.chain,
    transport: custom(provider),
  });

  await assertEoa(net, address);
  return { address, walletClient, provider, info: picked.info, chainId };
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

/** The chain the wallet is on. 0 for an answer that cannot be read, which
 *  every caller treats as "not the chain we need". */
export async function readChainId(provider: Eip1193Provider): Promise<number> {
  try {
    const raw = await provider.request({ method: "eth_chainId" });
    const id = typeof raw === "string" ? Number.parseInt(raw, 16) : Number(raw);
    return Number.isNaN(id) ? 0 : id;
  } catch { return 0; }
}

/**
 * Move an already-connected wallet onto Arc, and report where it ended up.
 * The returned id is read back rather than assumed: a wallet may decline
 * silently, and a screen that believes a switch it never made would let the
 * payer sign against the wrong chain.
 */
export async function switchChain(wallet: ConnectedWallet, net: NetworkView): Promise<number> {
  await ensureChain(wallet.provider, net);
  return readChainId(wallet.provider);
}

/** Switch the wallet to Arc, adding the network if it has never seen it. */
async function ensureChain(provider: Eip1193Provider, net: NetworkView): Promise<void> {
  const hex = `0x${net.chain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
    return;
  } catch (err) {
    // A dismissed prompt is an answer. Following it immediately with a
    // different dialog is nagging, so it propagates instead.
    if (errorCode(err) === 4001) throw err;

    // Everything else gets the add. "Unrecognized chain ID" is 4902 in the
    // spec, but wallets disagree about how to say it: MetaMask wraps it as
    // -32603 with the real code under data.originalError, and some only say
    // it in the message. Matching on a top-level 4902 missed all of those and
    // rethrew the switch error, which is why the payer saw "Try adding the
    // chain using wallet_switchEthereumChain first" and no add ever happened.
    // Adding a chain the wallet already knows is harmless, and a genuine
    // failure surfaces with the add's own reason rather than the switch's.
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: net.chain.name,
        nativeCurrency: net.chain.nativeCurrency,
        // More than one, because a wallet validates the chain by calling the
        // endpoint, and one slow or blocked URL should not sink the add.
        rpcUrls: [...new Set([net.defaultRpc, ...net.chain.rpcUrls.default.http])],
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

/** No wallet answered discovery: the page shows how to get one, not an error. */
export class NoWalletError extends Error {}

/**
 * The page could not read the account from Arc's node, after the wallet had
 * answered. Nothing about the wallet: reporting it as a failed wallet
 * connection sent a payer looking for a fault in the wrong place. `reason`
 * keeps what the node said, for Technical details.
 */
export class ArcUnreachableError extends Error {
  constructor(readonly network: "mainnet" | "testnet", readonly reason: string) {
    super(`Could not reach Arc ${network}: ${reason}`);
  }
}

/** viem's HttpRequestError says "HTTP request failed." and keeps the useful
 *  part — the status, or the browser's fetch failure — beside it. */
function httpReason(err: unknown): string {
  const e = err as { status?: number; details?: string; shortMessage?: string; message?: string };
  const parts = [e.status ? `HTTP ${e.status}` : "", e.details ?? ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : e.shortMessage ?? e.message ?? String(err);
}

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
  let code: string | undefined;
  try {
    code = await client.getCode({ address });
  } catch (err) {
    // The wallet has already answered; this is the page's own read of Arc.
    throw new ArcUnreachableError(net.name, `${net.defaultRpc}: ${httpReason(err)}`);
  }
  if (!code || code === "0x") return;

  // An EOA carrying an EIP-7702 delegation has code but is still an EOA with a
  // valid tx.origin. [unverified] whether Arc enables 7702; the guard prevents
  // a false rejection if it does.
  if (code.toLowerCase().startsWith("0xef0100")) return;

  throw new EoaRequiredError(
    "This address is a smart-contract wallet. Arc requires the payer to sign the transaction directly, so Safe, ERC-4337 and similar wallets cannot sign a Ledgerline run. Connect an ordinary EOA instead.",
  );
}

/**
 * Reports what the wallet did, rather than that it did something. An account
 * change and a chain change are different facts with different consequences:
 * a different account invalidates the connection outright, while a different
 * chain is a state the screen can show and offer to fix.
 *
 * Bound to the connected provider — subscribing to the global would miss the
 * connected wallet's own changes and fire on a wallet nobody is using.
 */
export function watchWallet(
  wallet: ConnectedWallet,
  on: { accountLost: () => void; chainChanged: (chainId: number) => void },
): () => void {
  const provider = wallet.provider;
  if (!provider.on || !provider.removeListener) return () => {};

  const onAccounts = (...args: unknown[]) => {
    const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
    // An empty list is the wallet revoking this site. A list still holding
    // our address is confirmation of the connect, not a change.
    const mine = accounts.some((a) => a?.toLowerCase() === wallet.address.toLowerCase());
    if (!mine) on.accountLost();
  };

  const onChain = (...args: unknown[]) => {
    const raw = args[0];
    const id = typeof raw === "string" ? Number.parseInt(raw, 16) : Number(raw);
    on.chainChanged(Number.isNaN(id) ? 0 : id);
  };

  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);
  return () => {
    provider.removeListener?.("accountsChanged", onAccounts);
    provider.removeListener?.("chainChanged", onChain);
  };
}
