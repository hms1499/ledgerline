import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTree, checkManifestAgainstRoot, leafFor, memoIdFor, verifyReceipt, type Hex } from "@ledgerline/core";
import { MAINNET_PROOF as P, controlComparison, publishedReceipt, publishedRunFile } from "@/lib/mainnet-proof";
import { decodeProof } from "@/lib/chain";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const NOTE = read("../../docs/notes/2026-09-24-mainnet-proof.md");
const README = read("../../README.md");

describe("the home page's proof is what was measured (spec §7.1)", () => {
  it("names the transaction the note and the README name", () => {
    expect(NOTE).toContain(P.txHash);
    expect(README).toContain(P.txHash);
  });

  it("prints the block, the gas, the price and the payments the note measured", () => {
    expect(NOTE).toContain(P.block.toLocaleString("en-US"));
    expect(NOTE).toContain(P.gasUsed.toLocaleString("en-US"));
    expect(NOTE).toContain(`${P.gasPriceGwei} Gwei`);
    for (const payment of P.payments) expect(NOTE).toContain(payment);
  });

  it("rounds the measured fee, 0.00559 USDC, and no further", () => {
    expect(NOTE).toContain("0.00559");
    expect(Number(P.feeUsdc)).toBeCloseTo(0.00559, 4);
  });

  it("counts the receipt's checks from the verifier itself", () => {
    const r = verifyReceipt({ chainId: 5042, invoiceId: "", runSalt: undefined, receiptStatus: "success", logs: [] });
    expect(r.rungs).toHaveLength(P.checksPerReceipt);
  });
});

describe("the control beside it is what was measured the same day", () => {
  it("names the approval and the batch the note and the README name", () => {
    for (const tx of [P.control.approveTx, P.control.batchTx]) {
      expect(NOTE).toContain(tx);
      expect(README).toContain(tx);
    }
  });

  it("prints the gas per payment the note measured, on both sides", () => {
    expect(NOTE).toMatch(/Referenced run[^\n]*\| 88,790 gas \|/);
    expect(NOTE).toMatch(/Naive batch[^\n]*\| 114,193 gas \|/);
    expect(P.gasUsed / P.payments.length).toBe(88_790);
    expect(P.control.gasUsed).toBe(114_193);
  });

  it("prints the allowance the control granted", () => {
    expect(NOTE).toContain(`approve Multicall3 for ${P.control.allowance}`);
  });
});

describe("controlComparison", () => {
  const rows = controlComparison();
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it("sets the two side by side, from the measured figures", () => {
    expect(rows.map((r) => [r.claim, r.ours, r.ordinary])).toEqual([
      ["Payments carrying their invoice", "3 of 3", "0 of 1"],
      ["Transactions the payer signs", "1", "2 — an approval, then the batch"],
      ["Spending allowance handed to a contract", "None", "0.10 USDC"],
      ["Sender the recipient sees", "The payer", "The payer"],
      ["Gas per payment", "88,790", "114,193"],
    ]);
  });

  it("says so plainly where the two do not differ", () => {
    // The control disproved the claim that an ordinary batch hides the payer.
    expect(row("sender").same).toBe(true);
    expect(rows.filter((r) => r.same).map((r) => r.key)).toEqual(["sender"]);
  });
});

describe("the proof run's published run file", () => {
  const PUBLISHED = JSON.parse(read("../public/proof/mainnet-run.json"));
  const file = publishedRunFile(P.txHash, "mainnet")!;
  // Read from PayoutAnchor.runs(runId) on Arc mainnet, 2026-09-29: this root,
  // payer 0x5955…de17, 3 items. [measured]
  const ANCHORED_ROOT = "0xdfe5aad26ab564dce2decea868eefa5ea7a6144d7f1fdabf660a4961bab3f330";

  it("is the file the app serves, for the proof transaction", () => {
    expect(PUBLISHED.txHash).toBe(P.txHash);
    expect(file.runSalt).toBe(PUBLISHED.runSalt);
    expect(file.items.every((i) => typeof i.amount === "bigint")).toBe(true);
  });

  it("says why its salt is public, where the rule against that is written", () => {
    expect(read("../../.gitignore")).toContain("frontend/public/proof/mainnet-run.json");
    expect(NOTE).toContain("/proof/mainnet-run.json");
  });

  it("is the list anchored on chain for the proof run", () => {
    expect(file.items.map((i) => i.invoiceId)).toEqual(["INV-US-001", "INV-EU-002", "INV-BTC-003"]);
    expect(checkManifestAgainstRoot(file, ANCHORED_ROOT).matches).toBe(true);
  });

  it("belongs to that run on mainnet only, whatever the hash's case", () => {
    expect(publishedRunFile(P.txHash.toUpperCase().replace("0X", "0x"), "mainnet")).toBeDefined();
    expect(publishedRunFile(P.txHash, "testnet")).toBeUndefined();
    expect(publishedRunFile(P.control.batchTx, "mainnet")).toBeUndefined();
  });
});

describe("publishedReceipt — a receipt link that opens as verified, never as incomplete", () => {
  const link = publishedReceipt(P.txHash, "mainnet")!;
  const q = new URL(link, "https://x.test").searchParams;
  const file = publishedRunFile(P.txHash, "mainnet")!;

  it("carries the invoice, the salt, the proof and the network", () => {
    expect(link.startsWith(`/r/${P.txHash}?`)).toBe(true);
    expect(q.get("i")).toBe("INV-US-001");
    expect(q.get("s")).toBe(file.runSalt);
    expect(q.get("n")).toBe("mainnet");
  });

  it("carries the proof that leads that invoice's line to the anchored root", () => {
    const leaves = file.items.map((i) => leafFor(memoIdFor(file.runSalt, i.invoiceId), i.token, i.to, i.amount));
    expect(decodeProof(q.get("p"))).toEqual(buildTree(leaves as Hex[]).proofFor(0));
  });

  it("offers no link for a run whose file is not published", () => {
    expect(publishedReceipt(P.txHash, "testnet")).toBeUndefined();
    expect(publishedReceipt(P.control.batchTx, "mainnet")).toBeUndefined();
  });

  it("is the receipt the README sends a reviewer to", () => {
    expect(README).toContain(`https://ledgerline-chi-sandy.vercel.app${link}`);
  });
});

describe("every page that points at the proof opens something complete", () => {
  it("/why links a receipt only when it can link a whole one", () => {
    const why = read("../app/(public)/why/Why.tsx");
    expect(why).not.toContain("href={`/r/${ours.hash}?n=${net.name}`}");
    expect(why).toContain("publishedReceipt(ours.hash, net.name)");
  });

  it("the home page's proof links a receipt that verifies", () => {
    const home = read("../app/(public)/page.tsx");
    expect(home).toContain('publishedReceipt(P.txHash, "mainnet")');
    expect(home).toContain("Open a receipt");
  });

  it("the proof run's page offers its published file", () => {
    const run = read("../app/(app)/run/[txHash]/Reconciliation.tsx");
    expect(run).toContain("publishedRunFile(txHash, net.name)");
    expect(run).toMatch(/Load this proof run(&apos;|')s published file/);
  });
});
