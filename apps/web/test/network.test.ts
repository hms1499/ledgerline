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
