import { describe, it, expect } from "vitest";
import { receiptUrl, decodeProof } from "@/lib/chain";

const TX = ("0x" + "12".repeat(32)) as `0x${string}`;
const SALT = ("0x" + "ab".repeat(32)) as `0x${string}`;
const PROOF = [("0x" + "cd".repeat(32)) as `0x${string}`, ("0x" + "ef".repeat(32)) as `0x${string}`];

describe("receiptUrl — the one place a receipt link is built", () => {
  const url = new URL(receiptUrl({
    origin: "https://ledgerline.test", txHash: TX, invoiceId: "INV 7/A&B",
    runSalt: SALT, proof: PROOF, network: "testnet",
  }));

  it("carries every piece of evidence the receipt page needs", () => {
    // A link without the salt opens as "incomplete" — the bug this replaces.
    expect(url.pathname).toBe(`/r/${TX}`);
    expect(url.searchParams.get("i")).toBe("INV 7/A&B");
    expect(url.searchParams.get("s")).toBe(SALT);
    expect(url.searchParams.get("n")).toBe("testnet");
    expect(decodeProof(url.searchParams.get("p"))).toEqual(PROOF);
  });

  it("works as a same-origin path when no origin is given", () => {
    const path = receiptUrl({ txHash: TX, invoiceId: "INV-1", runSalt: SALT, proof: PROOF, network: "testnet" });
    expect(path.startsWith(`/r/${TX}?`)).toBe(true);
  });
});
