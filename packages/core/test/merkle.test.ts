import { describe, it, expect } from "vitest";
import { keccak256, encodeAbiParameters, concatHex } from "viem";
import { leafFor, buildTree } from "../src/merkle.js";
import { USDC_ADDRESS } from "../src/constants.js";

const A = "0x2222222222222222222222222222222222222222" as const;
const B = "0x3333333333333333333333333333333333333333" as const;
const ID1 = ("0x" + "aa".repeat(32)) as `0x${string}`;
const ID2 = ("0x" + "bb".repeat(32)) as `0x${string}`;
const ID3 = ("0x" + "cc".repeat(32)) as `0x${string}`;

describe("leafFor", () => {
  it("is keccak256(abi.encode(memoId, token, to, amount))", () => {
    expect(leafFor(ID1, USDC_ADDRESS, A, 1_000_000n)).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
          [ID1, USDC_ADDRESS, A, 1_000_000n],
        ),
      ),
    );
  });

  it("changes when any field changes", () => {
    const base = leafFor(ID1, USDC_ADDRESS, A, 1_000_000n);
    expect(leafFor(ID2, USDC_ADDRESS, A, 1_000_000n)).not.toBe(base);
    expect(leafFor(ID1, USDC_ADDRESS, B, 1_000_000n)).not.toBe(base);
    expect(leafFor(ID1, USDC_ADDRESS, A, 1_000_001n)).not.toBe(base);
  });
});

describe("buildTree", () => {
  it("returns the single leaf as the root for a one-item tree", () => {
    const leaf = leafFor(ID1, USDC_ADDRESS, A, 1n);
    const { root, proofFor } = buildTree([leaf]);
    expect(root).toBe(leaf);
    expect(proofFor(0)).toEqual([]);
  });

  it("hashes pairs in sorted order, matching OpenZeppelin", () => {
    const l1 = leafFor(ID1, USDC_ADDRESS, A, 1n);
    const l2 = leafFor(ID2, USDC_ADDRESS, B, 2n);
    const [lo, hi] = l1.toLowerCase() <= l2.toLowerCase() ? [l1, l2] : [l2, l1];
    expect(buildTree([l1, l2]).root).toBe(keccak256(concatHex([lo, hi])));
  });

  it("produces a proof that reproduces the root for every leaf", () => {
    const leaves = [
      leafFor(ID1, USDC_ADDRESS, A, 1n),
      leafFor(ID2, USDC_ADDRESS, B, 2n),
      leafFor(ID3, USDC_ADDRESS, A, 3n),
    ];
    const { root, proofFor } = buildTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      let computed = leaves[i]!;
      for (const sibling of proofFor(i)) {
        const [lo, hi] =
          computed.toLowerCase() <= sibling.toLowerCase()
            ? [computed, sibling]
            : [sibling, computed];
        computed = keccak256(concatHex([lo, hi]));
      }
      expect(computed).toBe(root);
    }
  });

  it("rejects an empty leaf set", () => {
    expect(() => buildTree([])).toThrow(/at least one/);
  });
});
