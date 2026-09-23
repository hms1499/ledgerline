import { describe, it, expect } from "vitest";
import {
  parseCsv, resolveRows, validateRun, tokensForChain, ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID,
} from "@ledgerline/core";
import { SAMPLE_CSV, sampleCsvHref } from "@/lib/sample-csv";

// Decimals as read from chain for the three tokens (6, 6, 8).
const decimalsFor = (chainId: number) => {
  const t = tokensForChain(chainId);
  return { [t.USDC.toLowerCase()]: 6, [t.EURC.toLowerCase()]: 6, [t.cirBTC.toLowerCase()]: 8 };
};

describe("the sample CSV a new payer starts from", () => {
  for (const chainId of [ARC_TESTNET_CHAIN_ID, ARC_CHAIN_ID]) {
    it(`parses and validates with no problems on chain ${chainId}`, () => {
      // A sample that fails its own upload screen teaches nothing.
      const { rows, issues } = parseCsv(SAMPLE_CSV);
      const resolved = resolveRows(rows, tokensForChain(chainId), decimalsFor(chainId));
      const { errors } = validateRun(resolved.items);
      expect([...issues, ...resolved.issues, ...errors]).toEqual([]);
      expect(resolved.items).toHaveLength(3);
    });
  }

  it("downloads as the same text it shows", () => {
    const href = sampleCsvHref();
    expect(href.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(href.slice("data:text/csv;charset=utf-8,".length))).toBe(SAMPLE_CSV);
  });
});
