import { describe, it, expect } from "vitest";
import { proofsFromChain } from "../src/links.js";
import { buildTree, leafFor } from "../src/merkle.js";
import type { Hex, PaymentRecord } from "../src/types.js";

const pay = (n: number): PaymentRecord => ({
  memoId: ("0x" + n.toString(16).padStart(64, "0")) as Hex,
  payer: "0x1111111111111111111111111111111111111111",
  token: "0x3600000000000000000000000000000000000000",
  to: "0x2222222222222222222222222222222222222222",
  value: BigInt(n) * 1000n,
  memoData: "0x",
  memoIndex: BigInt(n),
  identityBroken: false,
  transferFrom: "0x1111111111111111111111111111111111111111",
});

const payments = [pay(1), pay(2), pay(3)];
const tree = buildTree(payments.map((p) => leafFor(p.memoId, p.token, p.to, p.value)));

describe("proofsFromChain — Merkle proofs rebuilt from a run's own logs", () => {
  it("gives each payment the proof the run was built with, when the root matches", () => {
    const proofs = proofsFromChain(payments, tree.root)!;
    expect(proofs(payments[2]!.memoId)).toEqual(tree.proofFor(2));
  });

  it("matches memoIds regardless of case", () => {
    const proofs = proofsFromChain(payments, tree.root)!;
    expect(proofs(payments[0]!.memoId.toUpperCase().replace("0X", "0x") as Hex)).toEqual(tree.proofFor(0));
  });

  it("gives nothing for a memoId the run does not carry", () => {
    const proofs = proofsFromChain(payments, tree.root)!;
    expect(proofs(pay(9).memoId)).toBeUndefined();
  });

  it("refuses when the rebuilt root is not the anchored one", () => {
    // A proof that verifies against nothing is worse than no link at all.
    expect(proofsFromChain(payments, ("0x" + "ab".repeat(32)) as Hex)).toBeUndefined();
  });

  it("refuses when the anchored root is unknown or the run has no payments", () => {
    expect(proofsFromChain(payments, undefined)).toBeUndefined();
    expect(proofsFromChain([], tree.root)).toBeUndefined();
  });
});
