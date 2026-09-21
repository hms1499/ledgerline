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
import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  buildRun, buildPreflightData, clientRunIdFor, runIdFor,
  decodePreflightResult, gasPolicy, explainRevert,
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

const manifest: Manifest = {
  clientRunId: clientRunIdFor(account.address, items, RUN_LABEL),
  payer: account.address,
  chainId: net.chain.id,
  runSalt: keccak256(toHex(`ledgerline-${net.name}-salt-1`)),
  items,
};

const publicClient = createPublicClient({ chain: net.chain, transport: http(net.rpcUrl) });
const walletClient = createWalletClient({ account, chain: net.chain, transport: http(net.rpcUrl) });

await assertChainId(await publicClient.getChainId(), net);

const built = buildRun(manifest, net.anchor);

console.log(`\n  network      ${net.name} (${net.chain.id})`);
console.log(`  payer        ${account.address}`);
console.log(`  recipient    ${RECIPIENT}`);
console.log(`  anchor       ${net.anchor}`);
console.log(`  runLabel     ${RUN_LABEL}`);
console.log(`  clientRunId  ${manifest.clientRunId}`);
console.log(`  runId        ${runIdFor(account.address, manifest.clientRunId)}`);
console.log(`  root         ${built.root}`);

// Balances first: a preflight failure on a blocklisted or underfunded token is
// far easier to read when the holdings are on screen next to it.
console.log(`\n  holdings:`);
for (const [symbol, token] of Object.entries(net.tokens)) {
  const [balance, decimals] = await Promise.all([
    publicClient.readContract({
      address: token, functionName: "balanceOf", args: [account.address],
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view",
        inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const,
    }),
    publicClient.readContract({
      address: token, functionName: "decimals",
      abi: [{ type: "function", name: "decimals", stateMutability: "view",
        inputs: [], outputs: [{ type: "uint8" }] }] as const,
    }),
  ]);
  const need = items.filter((i) => i.token === token).reduce((a, i) => a + i.amount, 0n);
  const ok = balance >= need;
  console.log(
    `    ${ok ? "OK  " : "LOW "}  ${symbol.padEnd(6)} ${balance} raw (${decimals} dec), need ${need}`,
  );
}

// Preflight — never sign blind. allowFailure is true here even though the real
// run uses false, so a plain eth_call yields per-payment outcomes instead of
// reverting on the first problem. It is also the only way to see Arc's runtime
// blocklist, which exposes no pre-check.
console.log(`\n  preflight:`);
try {
  const preflight = await publicClient.call({
    account: account.address,
    to: built.to,
    data: buildPreflightData(manifest, net.anchor),
  });
  const outcomes = decodePreflightResult(preflight.data!);
  outcomes.forEach((o, i) => {
    const label = i === 0 ? "anchor commit" : manifest.items[i - 1]!.invoiceId;
    console.log(`    ${o.success ? "OK  " : "FAIL"}  ${label}`);
  });
  if (outcomes.some((o) => !o.success)) {
    console.error(`\n  Preflight found failures. Not signing.\n`);
    process.exit(1);
  }
} catch (err) {
  // The anchor call is allowFailure:false, so an already-committed run reverts
  // the whole aggregate here rather than returning per-call flags.
  const { name, message } = explainRevert(err);
  console.error(`\n  Preflight reverted${name ? ` with ${name}` : ""}. Not signing.`);
  console.error(`  ${message}\n`);
  process.exit(1);
}

if (dryRun) {
  console.log(`\n  --dry-run: everything checks out against live ${net.name} state. Nothing signed.\n`);
  process.exit(0);
}

const fees = gasPolicy(
  await publicClient.getGasPrice(),
  await publicClient.estimateMaxPriorityFeePerGas(),
);
const gas = await publicClient.estimateGas({
  account: account.address, to: built.to, data: built.data,
});
console.log(`\n  maxFee ${fees.maxFeePerGas} wei   tip ${fees.maxPriorityFeePerGas} wei   gas ${gas}`);

const hash = await walletClient.sendTransaction({
  to: built.to, data: built.data, ...fees, gas: (gas * 12n) / 10n,
});
console.log(`\n  sent: ${hash}`);

// Never report a payment as successful without a receipt.
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
const cost = receipt.gasUsed * receipt.effectiveGasPrice;
console.log(`  status:   ${receipt.status}`);
console.log(`  block:    ${receipt.blockNumber}`);
console.log(`  gasUsed:  ${receipt.gasUsed}`);
console.log(`  cost:     ${Number(cost) / 1e18} USDC`);
console.log(`  logs:     ${receipt.logs.length}`);
console.log(`  ${net.explorer}/tx/${hash}`);

const out = `docs/notes/${net.name}-manifest.json`;
mkdirSync("docs/notes", { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      ...manifest,
      items: manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: RUN_LABEL,
      txHash: hash,
      anchor: net.anchor,
      runId: runIdFor(account.address, manifest.clientRunId),
      root: built.root,
      memoIds: built.memoIds,
      proofs: built.proofs,
    },
    null, 2,
  ),
);
console.log(`\n  manifest written to ${out}\n`);
