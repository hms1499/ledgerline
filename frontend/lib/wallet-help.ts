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
