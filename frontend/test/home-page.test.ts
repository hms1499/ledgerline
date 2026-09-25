import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../app/(public)/page.tsx", import.meta.url)), "utf8");

describe("the home page", () => {
  it("says how a run works before it shows the proof", () => {
    expect(src.indexOf("How a run works")).toBeGreaterThan(-1);
    expect(src.indexOf("How a run works")).toBeLessThan(src.indexOf("Proof · Arc mainnet"));
  });
  it("says what a payer needs, and names tokens without decimal jargon", () => {
    expect(src).toContain("You need a browser wallet (MetaMask or Rabby) and USDC on Arc for the network fee.");
    expect(src).not.toMatch(/\bdp\b/);
  });
  it("sets the ordinary way beside the proof, before the footer, with a way to check it live", () => {
    const proof = src.indexOf("Proof · Arc mainnet");
    const versus = src.indexOf("The same payment, the ordinary way");
    expect(versus).toBeGreaterThan(proof);
    expect(versus).toBeLessThan(src.indexOf("<SiteFooter"));
    expect(src).toContain("controlComparison()");
    expect(src).toContain('href="/why?n=mainnet"');
    // The table says it; the old single figure would repeat it.
    expect(src).not.toContain("Referenced by a plain batch");
  });
});
