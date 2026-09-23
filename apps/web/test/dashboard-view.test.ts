import { describe, it, expect } from "vitest";
import { coverageView, RUN_STATUS, amountText, paidLine } from "@/lib/dashboard-view";

describe("coverageView — the line under the tiles", () => {
  it("all read: plain text naming the network", () => {
    const v = coverageView({ total: 12, covered: 12, missing: [], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "plain", retry: false, tilesBlank: false });
    expect(v.text).toBe("From 12 of 12 runs sent from this browser, read from Arc testnet.");
  });

  it("some missing: a warning with Retry, figures still shown", () => {
    const v = coverageView({ total: 12, covered: 11, missing: ["0x1"], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: false });
    expect(v.text).toBe("Totals cover 11 of 12 runs. 1 could not be read.");
  });

  it("none readable: the tiles go blank rather than claim zero", () => {
    const v = coverageView({ total: 3, covered: 0, missing: ["0x1", "0x2", "0x3"], attention: [] }, "mainnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: true });
    expect(v.text).toBe("None of the 3 runs could be read, so there are no totals to show.");
  });

  it("a run needing a look adds a note, in the singular and the plural", () => {
    expect(coverageView({ total: 2, covered: 2, missing: [], attention: ["0x1"] }, "testnet").attentionNote)
      .toBe("1 run has a payment that needs a look. It is left out of the totals.");
    expect(coverageView({ total: 3, covered: 3, missing: [], attention: ["0x1", "0x2"] }, "testnet").attentionNote)
      .toBe("2 runs have a payment that needs a look. They are left out of the totals.");
  });
});

describe("RUN_STATUS", () => {
  it("names every state", () => {
    expect(Object.keys(RUN_STATUS).sort()).toEqual(["attention", "not_found", "read", "reverted", "unreadable"]);
    expect(RUN_STATUS.attention.label).toBe("Needs a look");
  });
});

describe("amountText / paidLine", () => {
  const T1 = "0x3600000000000000000000000000000000000000";
  const T2 = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  it("formats with the chain's decimals and symbol", () => {
    expect(amountText(100_000n, T1, { decimals: 6, symbol: "USDC" })).toBe("0.1 USDC");
  });

  it("never guesses decimals: raw integer and a short address", () => {
    expect(amountText(100_000n, T2, {})).toBe("100000 (0x89B5…D72a)");
  });

  it("lists a run's tokens in the tile order, skipping unpaid ones", () => {
    const paid = new Map([[T2, { value: 100_000n }], [T1, { value: 100_000n }]]);
    const meta = { [T1.toLowerCase()]: { decimals: 6, symbol: "USDC" }, [T2.toLowerCase()]: { decimals: 6, symbol: "EURC" } };
    expect(paidLine(paid, [T1, T2, "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF"], meta)).toBe("0.1 USDC · 0.1 EURC");
    expect(paidLine(new Map(), [T1], meta)).toBe("Nothing");
  });
});
