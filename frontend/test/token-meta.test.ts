import { describe, it, expect } from "vitest";
import { amountFigure, amountText, metaFor } from "@/lib/token-meta";

const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const USDC = "0x3600000000000000000000000000000000000000";

describe("amountFigure / amountText — decimals from the chain or not at all", () => {
  it("formats in the token's own decimals", () => {
    expect(amountFigure(12_345_678n, CIRBTC, { decimals: 8 })).toBe("0.12345678");
    expect(amountText(12_345_678n, CIRBTC, { decimals: 8, symbol: "cirBTC" })).toBe("0.12345678 cirBTC");
  });

  it("without decimals shows the raw integer and the token, never a guessed 6", () => {
    expect(amountFigure(12_345_678n, CIRBTC, {})).toBe("12345678 (0x171a…baa0)");
    expect(amountText(12_345_678n, CIRBTC, { symbol: "cirBTC" })).toBe("12345678 (0x171a…baa0)");
    expect(amountFigure(12_345_678n, CIRBTC, {})).not.toBe("12.345678");
  });

  it("falls back to the short address when the symbol is empty", () => {
    expect(amountText(100_000n, USDC, { decimals: 6, symbol: "" })).toBe("0.1 0x3600…0000");
  });

  it("keeps a negative difference's sign", () => {
    expect(amountFigure(-50_000n, USDC, { decimals: 6 })).toBe("-0.05");
  });
});

describe("metaFor — one token's entry from the address-keyed records", () => {
  it("matches the token case-insensitively", () => {
    expect(metaFor("0xABCdef0000000000000000000000000000000001",
      { "0xabcdef0000000000000000000000000000000001": 6 },
      { "0xabcdef0000000000000000000000000000000001": "EURC" },
    )).toEqual({ decimals: 6, symbol: "EURC" });
  });
  it("leaves decimals undefined when none were read", () => {
    expect(metaFor(USDC, {}, {})).toEqual({ decimals: undefined, symbol: undefined });
  });
});
