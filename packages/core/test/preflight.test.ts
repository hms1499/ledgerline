import { describe, it, expect } from "vitest";
import { encodeAbiParameters } from "viem";
import { buildPreflightData, decodePreflightResult, gasPolicy } from "../src/preflight.js";
import { decodeFunctionData } from "viem";
import { USDC_ADDRESS } from "../src/constants.js";
import type { Manifest } from "../src/types.js";

const ANCHOR = "0x9999999999999999999999999999999999999999" as const;
const manifest: Manifest = {
  clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
  payer: "0x1111111111111111111111111111111111111111",
  chainId: 5042,
  runSalt: ("0x" + "07".repeat(32)) as `0x${string}`,
  items: [
    { invoiceId: "A", token: USDC_ADDRESS, to: "0x2222222222222222222222222222222222222222", amount: 1n },
    { invoiceId: "B", token: USDC_ADDRESS, to: "0x3333333333333333333333333333333333333333", amount: 2n },
  ],
};

const aggAbi = [{
  type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" }]}],
  outputs: [],
}] as const;

describe("buildPreflightData", () => {
  it("sets allowFailure true on the payment calls so each outcome is visible", () => {
    const { args } = decodeFunctionData({ abi: aggAbi, data: buildPreflightData(manifest, ANCHOR) });
    const calls = args![0] as readonly { allowFailure: boolean }[];
    expect(calls.slice(1).every((c) => c.allowFailure === true)).toBe(true);
  });
});

describe("decodePreflightResult", () => {
  it("decodes per-call success flags", () => {
    const encoded = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
      [[[true, "0x"], [false, "0xdeadbeef"], [true, "0x01"]]],
    );
    const results = decodePreflightResult(encoded);
    expect(results.map((r) => r.success)).toEqual([true, false, true]);
    expect(results[1]!.returnData).toBe("0xdeadbeef");
  });
});

describe("gasPolicy", () => {
  it("never falls below the 25 Gwei floor, because Arc silently drops cheaper transactions", () => {
    const { maxFeePerGas } = gasPolicy(1_000_000_000n, 0n);
    expect(maxFeePerGas).toBeGreaterThanOrEqual(25_000_000_000n);
  });

  it("scales above the floor when the network suggests more", () => {
    const { maxFeePerGas } = gasPolicy(40_000_000_000n, 0n);
    expect(maxFeePerGas).toBe(60_000_000_000n);
  });

  it("applies a 1 Gwei tip floor", () => {
    expect(gasPolicy(20_000_000_000n, 330_000_000n).maxPriorityFeePerGas).toBe(1_000_000_000n);
  });

  it("respects a higher suggested tip", () => {
    expect(gasPolicy(20_000_000_000n, 5_000_000_000n).maxPriorityFeePerGas).toBe(5_000_000_000n);
  });
});
