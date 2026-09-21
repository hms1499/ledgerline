import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { buildRun, clientRunIdFor, runIdFor } from "../src/build.js";
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

  it("derives a deterministic clientRunId from payer, items and label", () => {
    const a = clientRunIdFor(manifest.payer, manifest.items, "2026-09");
    const b = clientRunIdFor(manifest.payer, [...manifest.items], "2026-09");
    expect(a).toBe(b);
  });

  it("lets an identical payout run again under a new label", () => {
    // Audit H-1. A fixed monthly payroll has the same invoice ids and the same
    // amounts every month. Without a label those runs collide, PayoutAnchor
    // rejects the second with RunExists, and the payment becomes permanently
    // impossible — a write-once anchor with no admin cannot be undone.
    const september = clientRunIdFor(manifest.payer, manifest.items, "2026-09");
    const october = clientRunIdFor(manifest.payer, manifest.items, "2026-10");
    expect(october).not.toBe(september);
  });

  it("still blocks the same run submitted twice under the same label", () => {
    const once = clientRunIdFor(manifest.payer, manifest.items, "2026-09");
    const twice = clientRunIdFor(manifest.payer, manifest.items, "2026-09");
    expect(twice).toBe(once);
  });

  it("rejects an empty label, which would silently restore the collision", () => {
    expect(() => clientRunIdFor(manifest.payer, manifest.items, "")).toThrow(/label/i);
  });

  it("changes clientRunId when any item changes, so a corrected run is a new run", () => {
    const base = clientRunIdFor(manifest.payer, manifest.items, "2026-09");
    const edited = [...manifest.items];
    edited[0] = { ...edited[0]!, amount: 1_500_001n };
    expect(clientRunIdFor(manifest.payer, edited, "2026-09")).not.toBe(base);
  });

  it("is payer-scoped, so two payers submitting the same list do not collide", () => {
    const other = "0x5555555555555555555555555555555555555555" as const;
    expect(clientRunIdFor(other, manifest.items, "2026-09")).not.toBe(
      clientRunIdFor(manifest.payer, manifest.items, "2026-09"),
    );
  });

  it("ignores item order, so re-sorting a spreadsheet is not a new run", () => {
    const reversed = [...manifest.items].reverse();
    expect(clientRunIdFor(manifest.payer, reversed, "2026-09")).toBe(
      clientRunIdFor(manifest.payer, manifest.items, "2026-09"),
    );
  });

  it("cannot be forged by an invoiceId carrying delimiter characters", () => {
    // Found during the H-1 fix: the old implementation joined fields with "|"
    // and rows with "\n", so one crafted row canonicalised identically to two
    // honest ones. Every field is ABI-encoded at fixed width now.
    const T = USDC_ADDRESS;
    const R = "0x2222222222222222222222222222222222222222" as const;
    const honest = [
      { invoiceId: "A", token: T, to: R, amount: 1n },
      { invoiceId: "B", token: T, to: R, amount: 2n },
    ];
    const crafted = [
      { invoiceId: `A|${T.toLowerCase()}|${R.toLowerCase()}|1\nB`, token: T, to: R, amount: 2n },
    ];
    expect(clientRunIdFor(manifest.payer, crafted, "2026-09")).not.toBe(
      clientRunIdFor(manifest.payer, honest, "2026-09"),
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

describe("runIdFor", () => {
  it("mirrors PayoutAnchor.runIdFor exactly", () => {
    // Measured against the deployed testnet anchor: runIdFor(payer, clientRunId)
    // returned this for the values below.
    const payer = "0x595558B91DFAA97840F2F00bF6728A74B8E6de17" as const;
    const clientRunId =
      "0x5787be5461a5e6d8669afadaa28f544125016fb24a3f53c88845523fc09faa63" as const;
    expect(runIdFor(payer, clientRunId)).toBe(
      "0x710619a6cf9f3351b81dfc44c718ed372ba246872040141c5a3ec6b40aee66a6",
    );
  });

  it("is namespaced by payer, so nobody can squat another payer's id", () => {
    const id = ("0x" + "11".repeat(32)) as `0x${string}`;
    expect(runIdFor("0x1111111111111111111111111111111111111111", id)).not.toBe(
      runIdFor("0x2222222222222222222222222222222222222222", id),
    );
  });
});
