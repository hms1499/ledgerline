/**
 * The referenced, anchored, multi-token payout — Ledgerline's central claim,
 * executed as one transaction.
 *
 *   pnpm dlx tsx scripts/run-payout.ts --network testnet
 *   pnpm dlx tsx scripts/run-payout.ts --network mainnet --dry-run
 *   pnpm dlx tsx scripts/run-payout.ts --network mainnet
 *
 * --dry-run stops after preflight, so the whole path can be checked against
 * real mainnet state without signing anything.
 */
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  buildRun, clientRunIdFor, runIdFor,
  executeRun, ioFromPublicClient,
  saltMessageFor, saltFromSignature,
  type Manifest, type ManifestItem,
} from "@ledgerline/core";
import { resolveNetwork, assertChainId, hasFlag } from "./lib/network.js";

const net = resolveNetwork();
const dryRun = hasFlag("--dry-run");
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const RECIPIENT = process.env.DEMO_RECIPIENT as `0x${string}`;
if (!RECIPIENT) throw new Error("DEMO_RECIPIENT is not set in .env");

/**
 * The period this run belongs to. A fixed-salary payroll has the same invoice
 * ids and amounts every month, so this is what keeps the anchor's replay guard
 * from permanently blocking next month's legitimate payment.
 */
const RUN_LABEL = process.env.RUN_LABEL || `${net.name}-2026-09`;

const items: ManifestItem[] = [
  { invoiceId: "INV-US-001",  token: net.tokens.USDC,   to: RECIPIENT, amount: 100_000n }, // 0.10 USDC
  { invoiceId: "INV-EU-002",  token: net.tokens.EURC,   to: RECIPIENT, amount: 100_000n }, // 0.10 EURC
  { invoiceId: "INV-BTC-003", token: net.tokens.cirBTC, to: RECIPIENT, amount: 1_000n },   // 0.00001 cirBTC
];

const publicClient = createPublicClient({ chain: net.chain, transport: http(net.rpcUrl) });
const walletClient = createWalletClient({ account, chain: net.chain, transport: http(net.rpcUrl) });

await assertChainId(await publicClient.getChainId(), net);

// The salt is now derived from the payer's signature rather than a public
// constant, so an observer cannot recompute the references. Same derivation
// the browser uses.
const runSalt = saltFromSignature(
  await account.signMessage({ message: saltMessageFor(net.chain.id, RUN_LABEL) }),
);

const manifest: Manifest = {
  clientRunId: clientRunIdFor(account.address, items, RUN_LABEL),
  payer: account.address,
  chainId: net.chain.id,
  runSalt,
  items,
};

const built = buildRun(manifest, net.anchor);

console.log(`\n  network      ${net.name} (${net.chain.id})`);
console.log(`  payer        ${account.address}`);
console.log(`  recipient    ${RECIPIENT}`);
console.log(`  anchor       ${net.anchor}`);
console.log(`  runLabel     ${RUN_LABEL}`);
console.log(`  clientRunId  ${manifest.clientRunId}`);
console.log(`  runId        ${runIdFor(account.address, manifest.clientRunId)}`);
console.log(`  root         ${built.root}`);

if (dryRun) {
  // Preflight without signing: executeRun's send is never reached because the
  // balance and simulation stages come first and we stop at them.
  const outcome = await executeRun({
    manifest, anchor: net.anchor, io: ioFromPublicClient(publicClient),
    send: async () => { throw new Error("--dry-run: refusing to sign"); },
    onProgress: (s) => console.log(`  ${s}…`),
  });
  if (outcome.state === "blocked" && outcome.reason !== "signature") {
    console.error(`\n  ${outcome.details}\n`);
    process.exit(1);
  }
  console.log(`\n  --dry-run: everything checks out against live ${net.name} state. Nothing signed.\n`);
  process.exit(0);
}

const outcome = await executeRun({
  manifest,
  anchor: net.anchor,
  io: ioFromPublicClient(publicClient),
  send: (tx) => walletClient.sendTransaction(tx),
  onProgress: (s) => console.log(`  ${s}…`),
});

console.log();
switch (outcome.state) {
  case "blocked":
    console.error(`  blocked (${outcome.reason}): ${outcome.details}\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "dropped":
    console.error(`  DROPPED: ${outcome.txHash}`);
    console.error(`  The node has never seen this transaction. On Arc that means the`);
    console.error(`  mempool discarded it, which happens silently below 20 Gwei.`);
    console.error(`  It was sent at ${outcome.sentMaxFeePerGas} wei. Safe to run again.\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "pending":
    console.error(`  PENDING: ${outcome.txHash}`);
    console.error(`  No receipt inside the timeout. This is NOT a successful payment.`);
    if (outcome.feeWarning) console.error(`  ${outcome.feeWarning}`);
    console.error(`  ${net.explorer}/tx/${outcome.txHash}\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "reverted":
    console.error(`  REVERTED: ${outcome.txHash}`);
    console.error(`  No money moved and no anchor was written. Safe to run again.\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "confirmed": {
    const { receipt, txHash } = outcome;
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    console.log(`  status:   success`);
    console.log(`  block:    ${receipt.blockNumber}`);
    console.log(`  gasUsed:  ${receipt.gasUsed}`);
    console.log(`  cost:     ${Number(cost) / 1e18} USDC`);
    console.log(`  logs:     ${receipt.logs.length}`);
    if (outcome.feeWarning) console.log(`\n  WARNING  ${outcome.feeWarning}`);
    console.log(`  ${net.explorer}/tx/${txHash}`);

    const out = `docs/notes/${net.name}-manifest.json`;
    mkdirSync("docs/notes", { recursive: true });
    writeFileSync(out, JSON.stringify({
      ...manifest,
      items: manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: RUN_LABEL,
      txHash,
      anchor: net.anchor,
      runId: runIdFor(account.address, manifest.clientRunId),
      root: built.root,
      memoIds: built.memoIds,
      proofs: built.proofs,
    }, null, 2));
    console.log(`\n  manifest written to ${out}\n`);
    break;
  }
}
