import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyReceipt } from "@ledgerline/core";
import { MAINNET_PROOF as P, controlComparison } from "@/lib/mainnet-proof";

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
    const r = verifyReceipt({ invoiceId: "", runSalt: undefined, receiptStatus: "success", logs: [] });
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
