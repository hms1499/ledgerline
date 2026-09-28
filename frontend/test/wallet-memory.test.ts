import { describe, it, expect } from "vitest";
import {
  findRemembered, forgetWallet, rememberWallet, rememberedWallet, walletKey, rememberEoa, isKnownEoa, type KeyStore,
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

describe("addresses this browser saw pass the EOA check", () => {
  const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
  const B = "0x595558b91dfaa97840f2f00bf6728a74b8e6de17";

  it("knows an address it recorded, whatever its case, on the chain it was checked on only", () => {
    const s = store();
    rememberEoa(5_042_002, A, s);
    expect(isKnownEoa(5_042_002, A.toLowerCase(), s)).toBe(true);
    expect(isKnownEoa(5_042, A, s)).toBe(false);
    expect(isKnownEoa(5_042_002, B, s)).toBe(false);
  });

  it("keeps the most recent few, so the list cannot grow without end", () => {
    const s = store();
    for (let i = 0; i < 25; i++) rememberEoa(1, `0x${i.toString(16).padStart(40, "0")}`, s);
    expect(isKnownEoa(1, `0x${(24).toString(16).padStart(40, "0")}`, s)).toBe(true);
    expect(isKnownEoa(1, `0x${(0).toString(16).padStart(40, "0")}`, s)).toBe(false);
  });

  it("treats blocked or garbled storage as nothing known, never as an error", () => {
    expect(() => rememberEoa(1, A, broken)).not.toThrow();
    expect(isKnownEoa(1, A, broken)).toBe(false);
    const s = store();
    s.setItem("ledgerline:eoa:v1", "{not json");
    expect(isKnownEoa(1, A, s)).toBe(false);
    expect(() => rememberEoa(1, A, s)).not.toThrow();
    expect(isKnownEoa(1, A, s)).toBe(true);
  });
});
