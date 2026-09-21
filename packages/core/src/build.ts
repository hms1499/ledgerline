import { encodeAbiParameters, encodeFunctionData, keccak256, toHex } from "viem";
import { MEMO_ADDRESS, MULTICALL3FROM_ADDRESS } from "./constants.js";
import { memoIdFor } from "./memo.js";
import { buildTree, leafFor } from "./merkle.js";
import type { Address, Hex, Manifest, ManifestItem } from "./types.js";

export const MAX_ITEMS_PER_RUN = 400;

/**
 * Deterministic run id: the same payout list, submitted twice under the same
 * label, produces the same id — and PayoutAnchor rejects the repeat with
 * RunExists. Double payment is therefore blocked at the contract layer rather
 * than in the UI, which survives a closed browser tab, a double-clicked
 * button, or a retry after a timeout.
 *
 * Order-independent, because re-sorting a spreadsheet is not a different
 * payroll. Payer-scoped, so two companies paying identical lists never clash.
 *
 * `runLabel` is what separates "the same payroll, paid twice by accident" from
 * "next month's payroll, which happens to be identical". A fixed salary run
 * has the same invoice ids and amounts every month; without a label the second
 * month collides with the first and PayoutAnchor refuses it permanently, since
 * it is write-once and has no admin. Required rather than defaulted, because a
 * default would restore exactly that failure silently.
 *
 * Every field is ABI-encoded at fixed width and the invoiceId is hashed, so no
 * delimiter appearing inside an id can make one row canonicalise as two.
 */
export function clientRunIdFor(
  payer: Address,
  items: ManifestItem[],
  runLabel: string,
): Hex {
  if (runLabel.length === 0) {
    throw new Error(
      "runLabel must not be empty — it is what lets an identical payout run again next period",
    );
  }
  if (items.length === 0) throw new Error("cannot derive a run id from an empty item list");

  const itemHashes = items
    .map((i) =>
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
          [keccak256(toHex(i.invoiceId)), i.token, i.to, i.amount],
        ),
      ),
    )
    .sort();

  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "bytes32[]" }],
      [payer, keccak256(toHex(runLabel)), itemHashes],
    ),
  );
}

/**
 * The on-chain run key, mirroring PayoutAnchor.runIdFor. The contract derives
 * it from msg.sender, so `payer` must be the EOA that signs — not the batching
 * contract. Kept here because `clientRunId` and `runId` are different values
 * and looking up the wrong one on an explorer returns an empty record that
 * reads exactly like "the run was never committed".
 */
export function runIdFor(payer: Address, clientRunId: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [payer, clientRunId]),
  );
}

export interface BuiltRun {
  to: Address;
  data: Hex;
  root: Hex;
  leaves: Hex[];
  proofs: Hex[][];
  memoIds: Hex[];
  itemCount: number;
}

const erc20Abi = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const memoAbi = [{
  type: "function", name: "memo", stateMutability: "nonpayable",
  inputs: [
    { name: "target", type: "address" }, { name: "data", type: "bytes" },
    { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" },
  ], outputs: [],
}] as const;

const anchorAbi = [{
  type: "function", name: "commit", stateMutability: "nonpayable",
  inputs: [
    { name: "clientRunId", type: "bytes32" }, { name: "root", type: "bytes32" },
    { name: "itemCount", type: "uint32" },
  ], outputs: [],
}] as const;

const aggregateAbi = [{
  type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" },
  ]}],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success", type: "bool" }, { name: "returnData", type: "bytes" },
  ]}],
}] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Build one transaction that commits the manifest root and pays every item,
 * each carrying its own reference.
 *
 * allowFailure defaults to false: a partially-paid payroll is harder to
 * reconcile and harder to retry safely than one that did not happen. A failed
 * run reverts entirely, writes no anchor, and is safe to re-run with the same
 * CSV — the contract's replay guard makes double payment impossible.
 */
export function buildRun(
  manifest: Manifest,
  anchor: Address,
  opts: { allowFailure?: boolean } = {},
): BuiltRun {
  const allowFailure = opts.allowFailure ?? false;
  const { items, runSalt, clientRunId } = manifest;

  if (items.length === 0) throw new Error("manifest has no items");
  if (items.length > MAX_ITEMS_PER_RUN) {
    throw new Error(
      `run has ${items.length} items; the maximum is ${MAX_ITEMS_PER_RUN} to stay under Arc's 30M block gas limit`,
    );
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.invoiceId)) {
      throw new Error(`duplicate invoiceId "${item.invoiceId}" would make reconciliation ambiguous`);
    }
    seen.add(item.invoiceId);
    if (item.to.toLowerCase() === ZERO) {
      throw new Error(`invoice ${item.invoiceId} pays the zero address, which Arc reverts on`);
    }
    if (item.amount <= 0n) {
      throw new Error(`invoice ${item.invoiceId} has a non-positive amount`);
    }
  }

  const memoIds = items.map((i) => memoIdFor(runSalt, i.invoiceId));
  const leaves = items.map((i, idx) => leafFor(memoIds[idx]!, i.token, i.to, i.amount));
  const { root, proofFor } = buildTree(leaves);

  const calls = [
    {
      target: anchor,
      allowFailure: false, // the anchor must never be optional
      callData: encodeFunctionData({
        abi: anchorAbi, functionName: "commit",
        args: [clientRunId, root, items.length],
      }),
    },
    ...items.map((item, idx) => ({
      target: MEMO_ADDRESS,
      allowFailure,
      callData: encodeFunctionData({
        abi: memoAbi, functionName: "memo",
        args: [
          item.token,
          encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [item.to, item.amount] }),
          memoIds[idx]!,
          "0x",
        ],
      }),
    })),
  ];

  return {
    to: MULTICALL3FROM_ADDRESS,
    data: encodeFunctionData({ abi: aggregateAbi, functionName: "aggregate3", args: [calls] }),
    root,
    leaves,
    proofs: leaves.map((_, i) => proofFor(i)),
    memoIds,
    itemCount: items.length,
  };
}
