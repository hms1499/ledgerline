import { describe, it, expect } from "vitest";
import {
  isPhoneBrowser, metamaskDappLink, noWalletHelp, phoneWalletHelp, WALLET_INSTALL, FAUCET_URL,
} from "@/lib/wallet-help";

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
    expect(m.kind).toMatch(/can fund an ordinary account that does/);
  });
});

describe("isPhoneBrowser", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

  it("knows an iPhone and an Android phone", () => {
    expect(isPhoneBrowser({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isPhoneBrowser({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true);
  });

  it("knows an iPad asking for the desktop site by its touch points", () => {
    expect(isPhoneBrowser({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });

  it("leaves a desktop browser, a Mac included, with the desktop dialog", () => {
    expect(isPhoneBrowser({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isPhoneBrowser({ userAgent: WINDOWS })).toBe(false);
  });
});

describe("metamaskDappLink", () => {
  it("opens the page in MetaMask's browser, written without its protocol, as MetaMask documents", () => {
    expect(metamaskDappLink("https://ledgerline.example/dashboard"))
      .toBe("https://link.metamask.io/dapp/ledgerline.example/dashboard");
  });

  it("keeps the path and query as they are, unencoded, as MetaMask's own generator does", () => {
    expect(metamaskDappLink("https://ledgerline.example/new?n=testnet"))
      .toBe("https://link.metamask.io/dapp/ledgerline.example/new?n=testnet");
  });

  it("offers no link for a page that is not https", () => {
    expect(metamaskDappLink("http://localhost:3000/dashboard")).toBeUndefined();
  });
});

describe("phoneWalletHelp", () => {
  it("says to open the page inside a wallet app, not to install into the browser", () => {
    const p = phoneWalletHelp("mainnet");
    expect(p.title).toBe("Open this page in your wallet app");
    expect(p.body).not.toMatch(/reload/i);
    expect(p.others).toMatch(/built-in browser/);
  });

  it("carries the same funds and wallet-kind advice as the desktop dialog", () => {
    for (const n of ["mainnet", "testnet"] as const) {
      const d = noWalletHelp(n);
      const p = phoneWalletHelp(n);
      expect([p.funds, p.fundsLink, p.kind]).toEqual([d.funds, d.fundsLink, d.kind]);
    }
  });
});
