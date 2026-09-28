import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tokensForChain, ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from "@ledgerline/core";
import { PAYS_IN } from "@/lib/pays-in";

/** A PNG's size, from its IHDR chunk. */
function pngSize(publicPath: string): [number, number] {
  const b = readFileSync(fileURLToPath(new URL(`../public${publicPath}`, import.meta.url)));
  expect(b.subarray(1, 4).toString("ascii"), publicPath).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("PAYS_IN, the coins on the home page", () => {
  it("names exactly the tokens a run can pay in, on both networks, in their own case", () => {
    const symbols = PAYS_IN.map((c) => c.symbol);
    expect(symbols).toEqual(["USDC", "EURC", "cirBTC"]);
    for (const id of [ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID]) {
      expect(Object.keys(tokensForChain(id))).toEqual(symbols);
    }
  });

  it("shows each token's own icon, sharp at 28px on a 2x screen", () => {
    expect(PAYS_IN.map((c) => c.icon)).toEqual(["/tokens/usdc.png", "/tokens/eurc.png", "/tokens/cirbtc.png"]);
    for (const c of PAYS_IN) {
      const [w, h] = pngSize(c.icon);
      expect(w, c.icon).toBe(h);
      expect(w, c.icon).toBeGreaterThanOrEqual(56);
    }
  });
});
