import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { leafFor, buildTree } from "../src/merkle.js";
import { USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS } from "../src/constants.js";

describe("merkle vectors", () => {
  it("writes vectors for the Solidity cross-check", () => {
    const items = [
      { memoId: ("0x" + "a1".repeat(32)) as `0x${string}`, token: USDC_ADDRESS,
        to: "0x2222222222222222222222222222222222222222" as const, amount: 1_500_000n },
      { memoId: ("0x" + "b2".repeat(32)) as `0x${string}`, token: EURC_ADDRESS,
        to: "0x3333333333333333333333333333333333333333" as const, amount: 900_000n },
      { memoId: ("0x" + "c3".repeat(32)) as `0x${string}`, token: CIRBTC_ADDRESS,
        to: "0x4444444444444444444444444444444444444444" as const, amount: 1_000n },
    ];

    const leaves = items.map((i) => leafFor(i.memoId, i.token, i.to, i.amount));
    const { root, proofFor } = buildTree(leaves);

    mkdirSync("test/fixtures", { recursive: true });
    writeFileSync(
      "test/fixtures/merkle-vectors.json",
      JSON.stringify(
        {
          root,
          leaves,
          proofs: leaves.map((_, i) => proofFor(i)),
          // verifyItem now takes the fields and derives the leaf itself, so the
          // cross-check has to feed it the same fields rather than a bare hash.
          memoIds: items.map((i) => i.memoId),
          tokens: items.map((i) => i.token),
          recipients: items.map((i) => i.to),
          amounts: items.map((i) => i.amount.toString()),
        },
        null,
        2,
      ),
    );

    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(leaves).toHaveLength(3);
  });
});
