import { describe, it, expect } from "vitest";
import { parseGwei, toHex, type Hex } from "viem";
import { demoWallet, refusal } from "./demo-wallet.js";

// Anvil's first key: public, holds nothing anywhere that matters.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ME = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Hex;

describe("refusal — what the demo wallet will not sign", () => {
  it("refuses a fee under 25 Gwei, which Arc drops without a word", () => {
    expect(refusal({ maxFeePerGas: toHex(parseGwei("24")) }, ME)).toMatch(/under 25 Gwei/);
    expect(refusal({ gasPrice: toHex(parseGwei("20")) }, ME)).toMatch(/under 25 Gwei/);
  });

  it("refuses a transaction with no fee at all", () => {
    expect(refusal({}, ME)).toMatch(/fee of none/);
  });

  it("refuses to send from any address but its own, whatever the case", () => {
    expect(refusal({ from: "0x0000000000000000000000000000000000000001", maxFeePerGas: toHex(parseGwei("30")) }, ME))
      .toMatch(/asked to send from/);
    expect(refusal({ from: ME.toLowerCase() as Hex, maxFeePerGas: toHex(parseGwei("30")) }, ME)).toBeUndefined();
  });

  it("signs at the floor and above", () => {
    expect(refusal({ maxFeePerGas: toHex(parseGwei("25")) }, ME)).toBeUndefined();
  });
});

describe("demoWallet — one network per recording", () => {
  it("answers with its own address and its network's chain id", async () => {
    const w = demoWallet("mainnet", KEY, "http://127.0.0.1:1");
    expect(await w.answer("eth_requestAccounts", [])).toEqual([ME]);
    expect(await w.answer("eth_chainId", [])).toBe(toHex(5042));
  });

  it("refuses to switch to any other chain", async () => {
    const w = demoWallet("testnet", KEY, "http://127.0.0.1:1");
    await expect(w.answer("wallet_switchEthereumChain", [{ chainId: toHex(5042) }])).rejects.toThrow(/testnet only/);
  });
});
