import { describe, it, expect } from "vitest";
import { fundingFor, type Address } from "@ledgerline/core";
import { fundingView, treasuryTopUp } from "@/lib/funding-view";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as Address;
const R = "0x2222222222222222222222222222222222222222" as Address;
const decimals = { [USDC.toLowerCase()]: 6, [EURC.toLowerCase()]: 6 };
const symbols = { [USDC.toLowerCase()]: "USDC", [EURC.toLowerCase()]: "EURC" };

const view = (items: { token: Address; amount: bigint }[], balances: Record<string, bigint | undefined>) =>
  fundingView({
    lines: fundingFor(items.map((i) => ({ ...i, to: R })), balances),
    usdc: USDC, usdcHold: balances[USDC.toLowerCase()], decimals, symbols,
  });

describe("fundingView — the preview's balance check", () => {
  it("names each short token and by how much, in its own decimals", () => {
    const v = view(
      [{ token: USDC, amount: 1_000_000n }, { token: EURC, amount: 2_500_000n }],
      { [USDC.toLowerCase()]: 5_000_000n, [EURC.toLowerCase()]: 1_000_000n },
    );
    expect(v.rows).toMatchObject([
      { symbol: "USDC", need: "1", hold: "5", state: "ok" },
      { symbol: "EURC", need: "2.5", hold: "1", state: "short", shortBy: "1.5" },
    ]);
    expect(v.short).toBe(1);
  });

  it("does not block on a balance it could not read", () => {
    const v = view([{ token: EURC, amount: 1n }], { [USDC.toLowerCase()]: 1n });
    expect(v.rows[0]).toMatchObject({ state: "unknown" });
    expect(v.short).toBe(0);
  });

  it("warns when the payouts would leave no USDC for the network fee", () => {
    // Arc charges gas in USDC: exactly enough for the payouts is not enough.
    const v = view([{ token: USDC, amount: 1_000_000n }], { [USDC.toLowerCase()]: 1_000_000n });
    expect(v.short).toBe(0);
    expect(v.feeWarning).toMatch(/network fee/i);
  });

  it("warns for a run that pays no USDC from a wallet holding none", () => {
    const v = view([{ token: EURC, amount: 1n }], { [USDC.toLowerCase()]: 0n, [EURC.toLowerCase()]: 5n });
    expect(v.feeWarning).toMatch(/network fee/i);
  });

  it("leaves an outright USDC shortfall to the short row, not a second warning", () => {
    const v = view([{ token: USDC, amount: 2_000_000n }], { [USDC.toLowerCase()]: 1_000_000n });
    expect(v.short).toBe(1);
    expect(v.feeWarning).toBeUndefined();
  });

  it("stays quiet when USDC is left over, or its balance is unknown", () => {
    expect(view([{ token: USDC, amount: 1n }], { [USDC.toLowerCase()]: 2n }).feeWarning).toBeUndefined();
    expect(view([{ token: EURC, amount: 1n }], { [EURC.toLowerCase()]: 5n }).feeWarning).toBeUndefined();
  });

  it("shows raw figures, not guessed ones, for a token with no decimals read", () => {
    const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
    const v = fundingView({
      lines: fundingFor([{ token: CIRBTC, amount: 12_345_678n }], { [CIRBTC.toLowerCase()]: 1n }),
      usdc: USDC, usdcHold: undefined, decimals: {}, symbols: {},
    });
    expect(v.rows[0]).toMatchObject({ need: "12345678 (0x171a…baa0)", hold: "1 (0x171a…baa0)" });
  });
});

describe("treasuryTopUp — what to send a short wallet from a Safe or another wallet", () => {
  const W = "0x595558B91DFAA97840F2F00bF6728A74B8E6de17" as Address;
  const topUp = (items: { token: Address; amount: bigint }[], balances: Record<string, bigint | undefined>) =>
    treasuryTopUp({
      lines: fundingFor(items.map((i) => ({ ...i, to: R })), balances),
      wallet: W, network: "mainnet", decimals, symbols,
    });

  it("lists only the short tokens, each by what it is short, in its own decimals", () => {
    const t = topUp(
      [{ token: USDC, amount: 1_000_000n }, { token: EURC, amount: 2_500_000n }],
      { [USDC.toLowerCase()]: 5_000_000n, [EURC.toLowerCase()]: 1_000_000n },
    );
    expect(t?.sends).toEqual(["1.5 EURC"]);
  });

  it("gives the clipboard the full address, the network and one send per line", () => {
    const t = topUp(
      [{ token: USDC, amount: 3_000_000n }, { token: EURC, amount: 2_500_000n }],
      { [USDC.toLowerCase()]: 1_000_000n, [EURC.toLowerCase()]: 0n },
    );
    expect(t?.text).toBe(`Send to ${W} on Arc mainnet:\n2 USDC\n2.5 EURC`);
  });

  it("offers nothing when the wallet already covers the run", () => {
    expect(topUp([{ token: EURC, amount: 1n }], { [EURC.toLowerCase()]: 1n })).toBeUndefined();
  });

  it("offers nothing to copy when a short token's decimals are unknown", () => {
    // A raw integer pasted into a Safe's send form reads as whole tokens.
    const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
    const t = treasuryTopUp({
      lines: fundingFor([{ token: CIRBTC, amount: 12_345_678n }], { [CIRBTC.toLowerCase()]: 1n }),
      wallet: W, network: "mainnet", decimals: {}, symbols: {},
    });
    expect(t).toBeUndefined();
  });

  it("reminds that the network fee is paid in USDC on top", () => {
    const t = topUp([{ token: EURC, amount: 2n }], { [EURC.toLowerCase()]: 1n });
    expect(t?.fee).toMatch(/network fee/i);
    expect(t?.fee).toMatch(/USDC/);
  });
});

