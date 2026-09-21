#!/usr/bin/env -S npx tsx
import { createPublicClient, http, type Address } from "viem";
import { arc } from "viem/chains";
import { readFileSync } from "node:fs";
import { reconcile, type Manifest, type RawLog } from "@ledgerline/core";
import { formatRows } from "./format.js";

const args = process.argv.slice(2);
const txHash = args[0];
if (!txHash?.startsWith("0x")) {
  console.error("usage: arc-reconcile <txHash> [--rpc <url>] [--manifest <path>]");
  process.exit(1);
}

const rpcUrl = valueOf("--rpc") ?? "https://rpc.mainnet.arc.io";
const manifestPath = valueOf("--manifest");

function valueOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const client = createPublicClient({ chain: arc, transport: http(rpcUrl) });

const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

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

// Decimals come from chain, never hardcoded.
const tokens = [...new Set(result.payments.map((p) => p.token))];
const decimalsByToken = new Map<Address, number>();
for (const token of tokens) {
  const decimals = await client.readContract({
    address: token,
    abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const,
    functionName: "decimals",
  });
  decimalsByToken.set(token, Number(decimals));
}

console.log(`\n  Ledgerline reconciliation — ${txHash}`);
console.log(`  RPC: ${rpcUrl}   block ${receipt.blockNumber}\n`);
console.log(`  ${"status".padEnd(20)}  ${"invoice".padEnd(16)}  recipient     amount`);
console.log(`  ${"─".repeat(72)}`);
for (const row of formatRows(result.rows, decimalsByToken)) {
  console.log(`  ${row.line}`);
}
console.log(`\n  ${result.payments.length} referenced payment(s) found.\n`);
