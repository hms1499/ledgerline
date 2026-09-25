import { describe, it, expect } from "vitest";
import { noWalletHelp, WALLET_INSTALL, FAUCET_URL } from "@/lib/wallet-help";

describe("noWalletHelp", () => {
  it("says any browser wallet works, links two common ones and, on testnet, the faucet", () => {
    expect(WALLET_INSTALL).toEqual([
      { name: "MetaMask", href: "https://metamask.io/download" },
      { name: "Rabby", href: "https://rabby.io" },
    ]);
    const t = noWalletHelp("testnet");
    expect(t.title).toBe("You need a browser wallet");
    // The two links are examples, not a list of what is supported.
    expect(t.install).toBe("Any browser wallet works. Install one, then reload this page. Two common ones:");
    expect(t.funds).toBe("Get free test tokens at");
    expect(t.fundsLink).toEqual({ text: "faucet.circle.com", href: FAUCET_URL });
  });

  it("on mainnet names USDC for the fee and links nothing unverified", () => {
    const m = noWalletHelp("mainnet");
    expect(m.funds).toBe("Your wallet also needs USDC on Arc mainnet: it pays each run's network fee.");
    expect(m.fundsLink).toBeUndefined();
    expect(m.kind).toMatch(/like Safe/);
  });
});
