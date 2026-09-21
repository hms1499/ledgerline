/**
 * Task 14: a real, three-token referenced payout on Arc testnet.
 *
 * The plan called for two USDC payments. This pays USDC, EURC and cirBTC
 * instead, because the wallet holds all three on testnet and rehearsing the
 * exact shape of the mainnet demo costs nothing here. Three tokens also
 * exercises the decimal spread (6, 6, 8) and the USDC-only double log, which
 * a USDC-only run cannot.
 */
import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  buildRun, buildPreflightData, clientRunIdFor, runIdFor, decodePreflightResult, gasPolicy,
  explainRevert,
  USDC_TESTNET_ADDRESS, EURC_TESTNET_ADDRESS, CIRBTC_TESTNET_ADDRESS,
  type Manifest, type ManifestItem,
} from "@ledgerline/core";

const RPC = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const anchor = process.env.ANCHOR_TESTNET as `0x${string}`;
const RECIPIENT = process.env.DEMO_RECIPIENT as `0x${string}`;

// The period this run belongs to. Two months of an identical fixed-salary list
// differ only by this, so it is what keeps the anchor's replay guard from
// blocking next month's legitimate payment.
const RUN_LABEL = process.env.RUN_LABEL || "testnet-2026-09";

if (!anchor) throw new Error("ANCHOR_TESTNET is not set");
if (!RECIPIENT) throw new Error("DEMO_RECIPIENT is not set");

const items: ManifestItem[] = [
  { invoiceId: "T-US-001",  token: USDC_TESTNET_ADDRESS,   to: RECIPIENT, amount: 100_000n }, // 0.10 USDC
  { invoiceId: "T-EU-002",  token: EURC_TESTNET_ADDRESS,   to: RECIPIENT, amount: 100_000n }, // 0.10 EURC
  { invoiceId: "T-BTC-003", token: CIRBTC_TESTNET_ADDRESS, to: RECIPIENT, amount: 1_000n },   // 0.00001 cirBTC
];

const manifest: Manifest = {
  // Deterministic, so re-running this script unchanged must hit RunExists.
  clientRunId: clientRunIdFor(account.address, items, RUN_LABEL),
  payer: account.address,
  chainId: arcTestnet.id,
  runSalt: keccak256(toHex("ledgerline-testnet-salt-1")),
  items,
};

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(RPC) });

const built = buildRun(manifest, anchor);
console.log(`\n  payer        ${account.address}`);
console.log(`  anchor       ${anchor}`);
console.log(`  runLabel     ${RUN_LABEL}`);
console.log(`  clientRunId  ${manifest.clientRunId}`);
// The key the anchor actually stores under. Looking up clientRunId on an
// explorer returns an empty record that reads like "never committed".
console.log(`  runId        ${runIdFor(account.address, manifest.clientRunId)}`);
console.log(`  root         ${built.root}\n`);

// Preflight first — never sign blind.
console.log("  preflight:");
try {
  const preflight = await publicClient.call({
    account: account.address,
    to: built.to,
    data: buildPreflightData(manifest, anchor),
  });
  const outcomes = decodePreflightResult(preflight.data!);
  outcomes.forEach((o, i) => {
    const label = i === 0 ? "anchor commit" : manifest.items[i - 1]!.invoiceId;
    console.log(`    ${o.success ? "OK  " : "FAIL"}  ${label}`);
  });
  if (outcomes.some((o) => !o.success)) {
    console.error("\n  Preflight found failures. Not signing.\n");
    process.exit(1);
  }
} catch (err) {
  // The anchor call is allowFailure:false, so a committed run makes the whole
  // aggregate revert here rather than returning per-call flags.
  const { name, message } = explainRevert(err);
  console.error(`\n  Preflight reverted${name ? ` with ${name}` : ""}. Not signing.`);
  console.error(`  ${message}\n`);
  process.exit(1);
}

const fees = gasPolicy(
  await publicClient.getGasPrice(),
  await publicClient.estimateMaxPriorityFeePerGas(),
);
const gas = await publicClient.estimateGas({
  account: account.address, to: built.to, data: built.data,
});
console.log(`\n  maxFeePerGas ${fees.maxFeePerGas} wei   tip ${fees.maxPriorityFeePerGas} wei   gas ${gas}`);

const hash = await walletClient.sendTransaction({
  to: built.to, data: built.data, ...fees, gas: (gas * 12n) / 10n,
});
console.log(`\n  sent: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
const cost = receipt.gasUsed * receipt.effectiveGasPrice;
console.log(`  status:   ${receipt.status}`);
console.log(`  block:    ${receipt.blockNumber}`);
console.log(`  gasUsed:  ${receipt.gasUsed}`);
console.log(`  cost:     ${Number(cost) / 1e18} USDC`);
console.log(`  logs:     ${receipt.logs.length}`);

mkdirSync("docs/notes", { recursive: true });
writeFileSync(
  "docs/notes/testnet-manifest.json",
  JSON.stringify(
    {
      ...manifest,
      items: manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      txHash: hash, anchor, root: built.root,
      memoIds: built.memoIds, proofs: built.proofs,
    },
    null, 2,
  ),
);
console.log(`\n  manifest written to docs/notes/testnet-manifest.json\n`);
