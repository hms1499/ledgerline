import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../app/${path}`, import.meta.url)), "utf8");

describe("an amount set in monospace", () => {
  it("never breaks inside its figure or its token's name", () => {
    // `.hex` breaks anywhere, which a transaction hash needs; the paid table
    // showed "0.0000001 cirB / TC" at 1920 px wide.
    expect(source("styles/base.css")).toMatch(/\.hex\.amt\s*\{[^}]*word-break:\s*normal;[^}]*white-space:\s*nowrap;/);
  });

  it("is marked as an amount wherever a table shows one", () => {
    for (const file of ["(app)/new/Result.tsx", "(app)/run/[txHash]/Reconciliation.tsx"]) {
      const text = source(file);
      expect(text, file).not.toMatch(/className="hex">\s*\{amountText\(/);
      expect(text, file).toMatch(/className="hex amt">\s*\{amountText\(/);
    }
  });
});
