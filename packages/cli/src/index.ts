#!/usr/bin/env -S npx tsx
import { createPublicClient, http, TransactionReceiptNotFoundError, type Address } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import {
  reconcile, assessCompleteness, checkManifestAgainstRoot,
  type Manifest, type RawLog,
} from "@ledgerline/core";
import { formatRows, type TokenMeta } from "./format.js";
import { parseArgs, notFoundMessage } from "./args.js";
import { runIdFromLogs } from "./anchor.js";

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const { txHash, network, rpcUrl, anchor, manifestPath } = args;

const client = createPublicClient({
  chain: network === "mainnet" ? arc : arcTestnet,
  transport: http(rpcUrl),
});

const receipt = await client.getTransactionReceipt({ hash: txHash }).catch((err: unknown) => {
  if (err instanceof TransactionReceiptNotFoundError) {
    console.error(notFoundMessage(network));
    process.exit(1);
  }
  throw err;
});

if (receipt.status === "reverted") {
  console.log(`\n  This payout run did not execute — the transaction reverted.`);
  console.log(`  No money moved and nothing was paid.\n`);
  process.exit(0);
}

const logs: RawLog[] = receipt.logs.map((l, i) => ({
  address: l.address,
  topics: l.topics as `0x${string}`[],
  data: l.data,
  logIndex: l.logIndex ?? i,
}));

let manifest: Manifest | undefined;
if (manifestPath) {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest = {
    ...raw,
    items: raw.items.map((i: { amount: string }) => ({ ...i, amount: BigInt(i.amount) })),
  };
}

const result = reconcile(logs, manifest);

// Decimals and symbols come from the chain, never hardcoded. A failed read
// leaves the field out, and the amount prints unscaled rather than guessed.
const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
const meta = new Map<Address, TokenMeta>();
for (const token of new Set(result.rows.map((r) => r.token))) {
  const [decimals, symbol] = await Promise.allSettled([
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);
  meta.set(token, {
    decimals: decimals.status === "fulfilled" ? Number(decimals.value) : undefined,
    symbol: symbol.status === "fulfilled" ? symbol.value : undefined,
  });
}

// Was the whole run paid? Answerable from the anchor alone, without the run file.
const anchorAbi = [
  { type: "function", name: "runs", stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "root", type: "bytes32" }, { name: "payer", type: "address" },
      { name: "itemCount", type: "uint32" }, { name: "timestamp", type: "uint64" },
    ] },
] as const;
const runId = runIdFromLogs(logs, anchor);
let anchoredItemCount: number | undefined;
let anchoredRoot: `0x${string}` | undefined;
if (anchor && runId) {
  const [root, , itemCount] = await client.readContract({
    address: anchor, abi: anchorAbi, functionName: "runs", args: [runId],
  });
  anchoredItemCount = Number(itemCount);
  anchoredRoot = root;
}
const completeness = assessCompleteness({
  anchoredItemCount,
  paymentsFound: result.payments.length,
  unlinkedCount: result.rows.filter((r) => r.status === "unlinked").length,
});

console.log(`\n  Ledgerline reconciliation — ${txHash}`);
console.log(`  Arc ${network}   RPC: ${rpcUrl}   block ${receipt.blockNumber}\n`);
console.log(`  ${"status".padEnd(20)}  ${"invoice".padEnd(16)}  recipient    amount`);
console.log(`  ${"─".repeat(72)}`);
for (const row of formatRows(result.rows, meta, manifest !== undefined)) {
  console.log(`  ${row.line}`);
}
console.log(`\n  ${result.payments.length} referenced payment(s) found.`);
console.log(`  Completeness: ${completeness.verdict} — ${completeness.note}`);
if (!anchor) {
  console.log(`  No PayoutAnchor is known for ${network}; pass --anchor <address> to check completeness.`);
}
if (manifest) {
  console.log(`  Run file: ${checkManifestAgainstRoot(manifest, anchoredRoot).note}`);
} else {
  console.log(`  Pass --manifest <run file> to see which invoice each payment settles.`);
}
console.log();
