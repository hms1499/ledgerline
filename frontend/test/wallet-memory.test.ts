import { describe, it, expect } from "vitest";
import {
  findRemembered, forgetWallet, rememberWallet, rememberedWallet, walletKey, type KeyStore,
} from "@/lib/wallet-memory";
import type { WalletChoice, WalletInfo } from "@/lib/wallet";

const store = (): KeyStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
};
const broken: KeyStore = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

const info = (over: Partial<WalletInfo> = {}): WalletInfo =>
  ({ uuid: "5f0c…per-load", name: "MetaMask", rdns: "io.metamask", icon: "", ...over });
const choice = (i: WalletInfo): WalletChoice => ({ info: i, provider: { request: async () => null } });

describe("which wallet to reattach", () => {
  it("knows an announced wallet by rdns, which outlives the page; its uuid does not", () => {
    expect(walletKey(info())).toBe("io.metamask");
  });

  it("knows a wallet found only on window.ethereum by its stable injected uuid", () => {
    expect(walletKey(info({ rdns: "", uuid: "injected-0" }))).toBe("injected-0");
  });

  it("keeps the wallet's identity, and nothing that could sign or pay", () => {
    const s = store();
    rememberWallet(info(), s);
    expect([...s.data.values()]).toEqual(["io.metamask"]);
    expect(rememberedWallet(s)).toBe("io.metamask");
  });

  it("forgets on disconnect, so the next load stays disconnected", () => {
    const s = store();
    rememberWallet(info(), s);
    forgetWallet(s);
    expect(rememberedWallet(s)).toBeUndefined();
  });

  it("treats blocked storage as nothing remembered, never as an error", () => {
    expect(() => rememberWallet(info(), broken)).not.toThrow();
    expect(rememberedWallet(broken)).toBeUndefined();
    expect(() => forgetWallet(broken)).not.toThrow();
  });

  it("finds the remembered wallet among those that announced, and only it", () => {
    const rabby = choice(info({ name: "Rabby", rdns: "io.rabby" }));
    const metamask = choice(info());
    expect(findRemembered([rabby, metamask], "io.metamask")).toBe(metamask);
    expect(findRemembered([rabby], "io.metamask")).toBeUndefined();
    expect(findRemembered([rabby, metamask], undefined)).toBeUndefined();
  });
});
