import { describe, it, expect } from "vitest";
import { networkFromSearch } from "@/lib/use-network";
import { defaultNetwork } from "@/lib/chain";

const search = (q: string) => new URLSearchParams(q);

describe("networkFromSearch — the network an app route runs on", () => {
  it("honours ?n=mainnet and ?n=testnet", () => {
    expect(networkFromSearch(search("n=mainnet")).name).toBe("mainnet");
    expect(networkFromSearch(search("n=testnet")).name).toBe("testnet");
  });
  it("falls back to the configured default for anything else", () => {
    expect(networkFromSearch(search("")).name).toBe(defaultNetwork().name);
    expect(networkFromSearch(search("n=goerli")).name).toBe(defaultNetwork().name);
    expect(networkFromSearch(null).name).toBe(defaultNetwork().name);
  });
});

describe("defaultNetwork — the network a URL without ?n= opens on", () => {
  const saved = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  const withDefault = (v: string | undefined) => {
    if (v === undefined) delete process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
    else process.env.NEXT_PUBLIC_DEFAULT_NETWORK = v;
    try { return defaultNetwork().name; } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
      else process.env.NEXT_PUBLIC_DEFAULT_NETWORK = saved;
    }
  };

  it("is mainnet when nothing is configured, because that is where the product runs", () => {
    expect(withDefault(undefined)).toBe("mainnet");
    expect(withDefault("")).toBe("mainnet");
  });
  it("is testnet only when asked for by name", () => {
    expect(withDefault("testnet")).toBe("testnet");
    expect(withDefault("mainnet")).toBe("mainnet");
  });
});
