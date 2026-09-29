import { createPublicClient, http, TransactionReceiptNotFoundError, type Address } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import {
  reconcile, assessCompleteness, checkManifestAgainstRoot, knownTokenSymbol,
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

const chain = network === "mainnet" ? arc : arcTestnet;
const client = createPublicClient({ chain, transport: http(rpcUrl) });

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

// Decimals come from the chain, never hardcoded, and a failed read prints the
// amount unscaled rather than guessed. Names come from Ledgerline's token
// list, never from the contract's symbol(): a lookalike answers "USDC" as
// readily as the real one. A token off the list gets neither, so its amount
// prints as a raw integer beside its address.
const decimalsAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const meta = new Map<Address, TokenMeta>();
for (const token of new Set(result.rows.map((r) => r.token))) {
  const symbol = knownTokenSymbol(chain.id, token);
  if (!symbol) {
    meta.set(token, {});
    continue;
  }
  const decimals = await client
    .readContract({ address: token, abi: decimalsAbi, functionName: "decimals" })
    .then(Number, () => undefined);
  meta.set(token, { decimals, symbol });
}
const lookalikes = result.payments.filter((p) => !knownTokenSymbol(chain.id, p.token)).length;

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
if (lookalikes > 0) {
  console.log(`  WARNING: ${lookalikes} of them in a token that is not USDC, EURC or cirBTC on Arc ${network},`);
  console.log(`  whatever name it gives itself. Printed unscaled, beside the token's address.`);
}
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
