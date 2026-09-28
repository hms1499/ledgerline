import { describe, it, expect } from "vitest";
import { tokensForChain, ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from "@ledgerline/core";
import { PAYS_IN } from "@/lib/pays-in";

describe("PAYS_IN, the coins on the home page", () => {
  it("names exactly the tokens a run can pay in, on both networks, in their own case", () => {
    const symbols = PAYS_IN.map((c) => c.symbol);
    expect(symbols).toEqual(["USDC", "EURC", "cirBTC"]);
    for (const id of [ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID]) {
      expect(Object.keys(tokensForChain(id))).toEqual(symbols);
    }
  });

  it("stamps each coin with its currency's sign", () => {
    expect(PAYS_IN.map((c) => c.glyph)).toEqual(["$", "€", "₿"]);
  });
});
