/** Where a payer with no wallet goes next. Any browser wallet holding an
 *  ordinary account works; these two are examples, not the supported list.
 *  Both links resolved (200) on 2026-09-25; no bridge or swap link is
 *  offered, since none is verified. */
export const WALLET_INSTALL = [
  { name: "MetaMask", href: "https://metamask.io/download" },
  { name: "Rabby", href: "https://rabby.io" },
] as const;

export const FAUCET_URL = "https://faucet.circle.com";

export function noWalletHelp(network: "mainnet" | "testnet"): {
  title: string;
  install: string;
  funds: string;
  fundsLink?: { text: string; href: string };
  kind: string;
} {
  return {
    title: "You need a browser wallet",
    install: "Any browser wallet works. Install one, then reload this page. Two common ones:",
    funds: network === "testnet"
      ? "Get free test tokens at"
      : "Your wallet also needs USDC on Arc mainnet: it pays each run's network fee.",
    fundsLink: network === "testnet" ? { text: "faucet.circle.com", href: FAUCET_URL } : undefined,
    kind: "Use an ordinary wallet account. Multisig and smart-contract wallets, like Safe, cannot sign these payments.",
  };
}

/**
 * A phone's own browser, where no wallet can be installed: Safari and Chrome
 * on a phone take no extensions, so "install one, then reload" is a dead end
 * there. iPadOS asks for desktop pages and names itself a Mac; its touch
 * points give it away. Inside a wallet app's own browser a wallet is already
 * injected, so the no-wallet dialog never opens there.
 */
export function isPhoneBrowser(nav: { userAgent: string; maxTouchPoints?: number }): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Opens this page inside MetaMask's mobile browser, where it can sign.
 *
 * [docs] MetaMask documents https://link.metamask.io/dapp/{url}, with the
 * URL written without its protocol ("…/dapp/app.uniswap.org"); its own
 * deeplink generator builds the same by dropping "https://" and appending
 * the rest unencoded. It only takes https pages, so anything else gets no
 * link. [unverified] that a query string such as ?n=testnet survives the
 * hop into the app; the page's network badge says which network opened.
 */
export function metamaskDappLink(href: string): string | undefined {
  if (!href.startsWith("https://")) return undefined;
  return `https://link.metamask.io/dapp/${href.slice("https://".length)}`;
}

/** The no-wallet dialog on a phone: open this page inside a wallet app. */
export function phoneWalletHelp(network: "mainnet" | "testnet"): {
  title: string;
  body: string;
  metamask: string;
  metamaskMissing: string;
  others: string;
  funds: string;
  fundsLink?: { text: string; href: string };
  kind: string;
} {
  const desktop = noWalletHelp(network);
  return {
    title: "Open this page in your wallet app",
    body: "A phone's browser cannot reach a wallet app by itself. Open this page inside the wallet app's own browser, where it can sign.",
    metamask: "Open in MetaMask",
    metamaskMissing: "If MetaMask is not on this phone, get it from your app store first.",
    others: "Using Rabby or another wallet app? Copy this page's link and open it in the app's built-in browser.",
    funds: desktop.funds,
    fundsLink: desktop.fundsLink,
    kind: desktop.kind,
  };
}
