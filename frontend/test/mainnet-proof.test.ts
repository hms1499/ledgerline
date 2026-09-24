import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyReceipt } from "@ledgerline/core";
import { MAINNET_PROOF as P } from "@/lib/mainnet-proof";

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
