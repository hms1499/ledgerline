import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { buildRun, clientRunIdFor } from "../src/build.js";
import {
  MULTICALL3FROM_ADDRESS, MEMO_ADDRESS, USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS,
} from "../src/constants.js";
import { memoIdFor } from "../src/memo.js";
import type { Manifest } from "../src/types.js";

const ANCHOR = "0x9999999999999999999999999999999999999999" as const;
const SALT = ("0x" + "07".repeat(32)) as `0x${string}`;

const manifest: Manifest = {
  clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
  payer: "0x1111111111111111111111111111111111111111",
  chainId: 5042,
  runSalt: SALT,
  items: [
    { invoiceId: "INV-US-001", token: USDC_ADDRESS, to: "0x2222222222222222222222222222222222222222", amount: 1_500_000n },
    { invoiceId: "INV-EU-002", token: EURC_ADDRESS, to: "0x3333333333333333333333333333333333333333", amount: 900_000n },
    { invoiceId: "INV-BTC-003", token: CIRBTC_ADDRESS, to: "0x4444444444444444444444444444444444444444", amount: 1_000n },
  ],
};

describe("buildRun", () => {
  it("targets Multicall3From", () => {
    expect(buildRun(manifest, ANCHOR).to).toBe(MULTICALL3FROM_ADDRESS);
  });

  it("puts the anchor commit first, then one memo per item", () => {
    const built = buildRun(manifest, ANCHOR);
    const { args } = decodeFunctionData({
      abi: [{
        type: "function", name: "aggregate3", stateMutability: "nonpayable",
        inputs: [{ name: "calls", type: "tuple[]", components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" }]}],
        outputs: [],
      }] as const,
      data: built.data,
    });
    const calls = args![0] as readonly { target: string; allowFailure: boolean }[];
    expect(calls).toHaveLength(4);
    expect(calls[0]!.target.toLowerCase()).toBe(ANCHOR.toLowerCase());
    for (let i = 1; i < 4; i++) {
      expect(calls[i]!.target.toLowerCase()).toBe(MEMO_ADDRESS.toLowerCase());
    }
  });

  it("defaults allowFailure to false — a partial payroll is worse than none", () => {
    const built = buildRun(manifest, ANCHOR);
    const { args } = decodeFunctionData({
      abi: [{
        type: "function", name: "aggregate3", stateMutability: "nonpayable",
        inputs: [{ name: "calls", type: "tuple[]", components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" }]}],
        outputs: [],
      }] as const,
      data: built.data,
    });
    const calls = args![0] as readonly { allowFailure: boolean }[];
    expect(calls.every((c) => c.allowFailure === false)).toBe(true);
  });

  it("derives memoIds from the run salt", () => {
    const built = buildRun(manifest, ANCHOR);
    expect(built.memoIds[0]).toBe(memoIdFor(SALT, "INV-US-001"));
    expect(built.memoIds).toHaveLength(3);
  });

  it("produces one proof per item, all verifying against the root", () => {
    const built = buildRun(manifest, ANCHOR);
    expect(built.proofs).toHaveLength(3);
    expect(built.itemCount).toBe(3);
    expect(built.root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects a duplicate invoiceId, which would make reconciliation ambiguous", () => {
    const dup: Manifest = { ...manifest, items: [manifest.items[0]!, manifest.items[0]!] };
    expect(() => buildRun(dup, ANCHOR)).toThrow(/duplicate invoiceId/i);
  });

  it("rejects the zero address, which Arc reverts on", () => {
    const bad: Manifest = {
      ...manifest,
      items: [{ ...manifest.items[0]!, to: "0x0000000000000000000000000000000000000000" }],
    };
    expect(() => buildRun(bad, ANCHOR)).toThrow(/zero address/i);
  });

  it("rejects a zero amount", () => {
    const bad: Manifest = { ...manifest, items: [{ ...manifest.items[0]!, amount: 0n }] };
    expect(() => buildRun(bad, ANCHOR)).toThrow(/amount/i);
  });

  it("derives a deterministic clientRunId from payer and items", () => {
    const a = clientRunIdFor(manifest.payer, manifest.items);
    const b = clientRunIdFor(manifest.payer, [...manifest.items]);
    expect(a).toBe(b);
  });

  it("changes clientRunId when any item changes, so a corrected run is a new run", () => {
    const base = clientRunIdFor(manifest.payer, manifest.items);
    const edited = [...manifest.items];
    edited[0] = { ...edited[0]!, amount: 1_500_001n };
    expect(clientRunIdFor(manifest.payer, edited)).not.toBe(base);
  });

  it("is payer-scoped, so two payers submitting the same list do not collide", () => {
    const other = "0x5555555555555555555555555555555555555555" as const;
    expect(clientRunIdFor(other, manifest.items)).not.toBe(
      clientRunIdFor(manifest.payer, manifest.items),
    );
  });

  it("ignores item order, so re-sorting a spreadsheet is not a new run", () => {
    const reversed = [...manifest.items].reverse();
    expect(clientRunIdFor(manifest.payer, reversed)).toBe(
      clientRunIdFor(manifest.payer, manifest.items),
    );
  });

  it("rejects more than 400 items, to stay under the block gas limit", () => {
    const many: Manifest = {
      ...manifest,
      items: Array.from({ length: 401 }, (_, i) => ({
        invoiceId: `INV-${i}`, token: USDC_ADDRESS,
        to: "0x2222222222222222222222222222222222222222" as const, amount: 1n,
      })),
    };
    expect(() => buildRun(many, ANCHOR)).toThrow(/400/);
  });
});
