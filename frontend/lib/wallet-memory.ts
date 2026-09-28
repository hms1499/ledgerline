import type { WalletChoice, WalletInfo } from "@/lib/wallet";

/**
 * Which wallet this browser last connected, so a reload or a trip through a
 * public page does not leave the payer disconnected.
 *
 * Only the wallet's identity is kept: its EIP-6963 `rdns`, which is stable
 * across page loads (its `uuid` is not). No address, no permission. Whether
 * the site may still see an account is the wallet's own answer to
 * `eth_accounts`, asked again on every load, so revoking the site in the
 * wallet ends the reconnect as surely as Disconnect does here.
 */
const KEY = "ledgerline:wallet:v1";

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's storage, or none: private modes and blocked site data throw. */
function browserStore(): KeyStore | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

/** A wallet announced over EIP-6963 is known by `rdns`. One found only on
 *  `window.ethereum` has none, and its `injected-<n>` uuid is stable. */
export function walletKey(info: WalletInfo): string {
  return info.rdns || info.uuid;
}

export function rememberWallet(info: WalletInfo, store = browserStore()): void {
  try { store?.setItem(KEY, walletKey(info)); } catch { /* the reconnect is a convenience */ }
}

export function rememberedWallet(store = browserStore()): string | undefined {
  try { return store?.getItem(KEY) || undefined; } catch { return undefined; }
}

/** Disconnect says the payer is done: the next load must not reattach. */
export function forgetWallet(store = browserStore()): void {
  try { store?.removeItem(KEY); } catch { /* nothing to forget with */ }
}

export function findRemembered(choices: WalletChoice[], key: string | undefined): WalletChoice | undefined {
  return key ? choices.find((c) => walletKey(c.info) === key) : undefined;
}
