// Usage: npx tsx scripts/capture-receipt.ts <rpc> <txHash> <out.json> "<description>"
import { writeFileSync } from "node:fs";

const [rpc, txHash, out, description] = process.argv.slice(2);
if (!rpc || !txHash || !out || !description) {
  throw new Error('usage: capture-receipt.ts <rpc> <txHash> <out.json> "<description>"');
}

const res = await fetch(rpc, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
});
const body = await res.json();
if (body.error) throw new Error(`receipt failed: ${JSON.stringify(body.error)}`);
if (!body.result) throw new Error(`no receipt for ${txHash}`);
if (body.result.status !== "0x1") throw new Error(`${txHash} did not succeed`);

// RawLog shape: logIndex as a number, exactly what the web maps a viem receipt to.
const logs = body.result.logs.map((l: { address: string; topics: string[]; data: string; logIndex: string }) => ({
  address: l.address, topics: l.topics, data: l.data, logIndex: Number.parseInt(l.logIndex, 16),
}));

writeFileSync(out, JSON.stringify({ description, txHash, from: body.result.from, logs }, null, 2) + "\n");
console.log(`captured ${logs.length} logs from ${txHash}`);
