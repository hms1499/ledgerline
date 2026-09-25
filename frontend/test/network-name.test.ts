import { describe, it, expect } from "vitest";
import { chainName } from "@/lib/chain";
import { topUpHint } from "@/lib/funding-view";

describe("chainName", () => {
  it("names Arc's two networks and says plainly when it is another", () => {
    expect(chainName(5042)).toBe("Arc mainnet");
    expect(chainName(5042002)).toBe("Arc testnet");
    expect(chainName(1)).toBe("another network (chain 1)");
    expect(chainName(0)).toBe("a network it did not name");
    expect(chainName(undefined)).toBe("a network it did not name");
  });
});

describe("topUpHint", () => {
  it("links the faucet for test USDC, and otherwise says what to add or take out", () => {
    expect(topUpHint("USDC", "testnet")).toEqual({
      text: "Get free test USDC at", link: { text: "faucet.circle.com", href: "https://faucet.circle.com" },
    });
    expect(topUpHint("cirBTC", "mainnet")).toEqual({
      text: "Add cirBTC to this wallet on Arc mainnet, then check again — or take its lines out of the file.",
    });
    expect(topUpHint("EURC", "testnet").link).toBeUndefined();
  });
});
