/**
 * The negative control: the same payments through the standard Multicall3 that
 * every other chain uses, so the difference is visible side by side rather
 * than asserted.
 *
 *   pnpm dlx tsx scripts/naive-batch.ts --network testnet
 *
 * An ordinary batcher cannot move a payer's tokens without an allowance, so
 * this costs two transactions: approve, then the batch. It emits no reference
 * of any kind — that is the point.
 */
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gasPolicy, TRANSFER_TOPIC, SYSTEM_EMITTER, MEMO_TOPIC } from "@ledgerline/core";
import { resolveNetwork, assertChainId } from "./lib/network.js";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const net = resolveNetwork();
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const RECIPIENT = process.env.DEMO_RECIPIENT as `0x${string}`;
const AMOUNT = 100_000n; // 0.10 USDC, matching one line of the real run

const erc20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "transferFrom", stateMutability: "nonpayable",
    inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" },
             { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

const agg = [{
  type: "function", name: "aggregate3", stateMutability: "payable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" }, { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" }]}],
  outputs: [{ name: "r", type: "tuple[]", components: [
    { name: "success", type: "bool" }, { name: "returnData", type: "bytes" }]}],
}] as const;

const publicClient = createPublicClient({ chain: net.chain, transport: http(net.rpcUrl) });
const walletClient = createWalletClient({ account, chain: net.chain, transport: http(net.rpcUrl) });
await assertChainId(await publicClient.getChainId(), net);

const code = await publicClient.getCode({ address: MULTICALL3 });
if (!code || code === "0x") throw new Error(`no standard Multicall3 at ${MULTICALL3}`);

const fees = gasPolicy(
  await publicClient.getGasPrice(),
  await publicClient.estimateMaxPriorityFeePerGas(),
);

console.log(`\n  network   ${net.name} (${net.chain.id})`);
console.log(`  batcher   ${MULTICALL3}  (standard Multicall3)\n`);

// Step 1 — an ordinary batcher needs an allowance before it can move anything.
console.log(`  1. approve ${MULTICALL3} to spend ${AMOUNT} USDC`);
const approveHash = await walletClient.sendTransaction({
  to: net.tokens.USDC,
  data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [MULTICALL3, AMOUNT] }),
  ...fees, gas: 100_000n,
});
const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
console.log(`     ${approveHash}  (${approveReceipt.status}, ${approveReceipt.gasUsed} gas)`);

// Step 2 — the batch itself.
console.log(`\n  2. aggregate3([transferFrom(payer, recipient, ${AMOUNT})])`);
const hash = await walletClient.sendTransaction({
  to: MULTICALL3,
  data: encodeFunctionData({ abi: agg, functionName: "aggregate3", args: [[{
    target: net.tokens.USDC, allowFailure: false,
    callData: encodeFunctionData({
      abi: erc20, functionName: "transferFrom", args: [account.address, RECIPIENT, AMOUNT],
    }),
  }]] }),
  ...fees, gas: 300_000n,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`     ${hash}  (${receipt.status}, ${receipt.gasUsed} gas)`);

// What a recipient can actually read off this transaction.
console.log(`\n  what the chain records:`);
const transfers = receipt.logs.filter(
  (l) => l.topics[0] === TRANSFER_TOPIC && l.address.toLowerCase() !== SYSTEM_EMITTER,
);
const memos = receipt.logs.filter((l) => l.topics[0] === MEMO_TOPIC);

for (const l of transfers) {
  console.log(`    Transfer  token ${l.address}  from 0x${l.topics[1]!.slice(-40)}`);
}
console.log(`    Memo events: ${memos.length}`);
console.log(`\n    payer EOA  ${account.address}`);
console.log(`    batcher    ${MULTICALL3}`);

const fromIsPayer = transfers.every(
  (l) => `0x${l.topics[1]!.slice(-40)}`.toLowerCase() === account.address.toLowerCase(),
);
console.log(`\n  scorecard vs. the referenced run:`);
console.log(`    reference on chain          : ${memos.length > 0 ? "yes" : "NO"}`);
console.log(`    Transfer.from is the payer  : ${fromIsPayer ? "yes" : "NO"}`);
console.log(`    transactions needed         : 2 (approve, then batch)`);

// Read it rather than assert it. An earlier draft of this script printed
// "standing allowance left: yes" unconditionally, which the chain contradicts:
// this approval is for an exact amount and the transfer consumes all of it.
// Unlimited approvals do leave one standing — that is a property of how the
// tool approves, not of Multicall3, and the difference matters when the
// audience is Arc engineers reading the same logs.
const remaining = await publicClient.readContract({
  address: net.tokens.USDC, abi: erc20, functionName: "allowance",
  args: [account.address, MULTICALL3],
});
console.log(`    allowance required first    : yes, to a contract the payer does not control`);
console.log(
  `    allowance left standing     : ${remaining}` +
  (remaining === 0n
    ? "  (exact-amount approval, fully spent)"
    : "  (outlives the payment, on a contract the payer does not control)"),
);
console.log(`\n  Note: transferFrom(from, ...) emits Transfer(from, ...), so this route does`);
console.log(`  keep the payer visible. Identity is lost only with a custodial batcher that`);
console.log(`  pays from its own balance. The missing reference is the difference that`);
console.log(`  holds against every batcher shape.`);
console.log(`  ${net.explorer}/tx/${hash}\n`);
