import { concatHex, encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "./types.js";

export function leafFor(memoId: Hex, token: Address, to: Address, amount: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
      [memoId, token, to, amount],
    ),
  );
}

/** OpenZeppelin MerkleProof._hashPair — commutative, sorted. */
function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(concatHex([a, b]))
    : keccak256(concatHex([b, a]));
}

/**
 * A leaf's Merkle proof lets a recipient prove their own line is in the
 * committed manifest without seeing anyone else's amount — which is what makes
 * this usable for payroll at all.
 */
export function buildTree(leaves: Hex[]): { root: Hex; proofFor(index: number): Hex[] } {
  if (leaves.length === 0) throw new Error("buildTree needs at least one leaf");

  const levels: Hex[][] = [leaves];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      next.push(right === undefined ? left : hashPair(left, right));
    }
    levels.push(next);
  }

  const root = levels[levels.length - 1]![0]!;

  function proofFor(index: number): Hex[] {
    if (index < 0 || index >= leaves.length) throw new Error(`no leaf at index ${index}`);
    const proof: Hex[] = [];
    let idx = index;
    for (let level = 0; level < levels.length - 1; level++) {
      const nodes = levels[level]!;
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling = nodes[siblingIdx];
      if (sibling !== undefined) proof.push(sibling);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  return { root, proofFor };
}
