import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const src = read("../app/(public)/page.tsx");
const shell = read("../components/shell/PublicShell.tsx");

describe("the home page", () => {
  it("follows ?n= like the badge above it, and carries it on its links", () => {
    // It read the build's default network while the badge read the URL, so
    // /?n=testnet said "Arc testnet" above "This is Arc mainnet".
    expect(src).toContain('const net = networkFor(search.get("n"));');
    expect(src).not.toContain("defaultNetwork()");
    expect(src).toContain('href={withNet("/new", search)}');
    expect(src).toContain('href={withNet("/dashboard", search)}');
  });
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
    // The footer comes after all of it: the shell renders it after <main>.
    expect(src).not.toContain("<SiteFooter");
    expect(shell.indexOf("<SiteFooter")).toBeGreaterThan(shell.indexOf("</main>"));
    expect(src).toContain("controlComparison()");
    expect(src).toContain('href="/why?n=mainnet"');
    // The table says it; the old single figure would repeat it.
    expect(src).not.toContain("Referenced by a plain batch");
  });
  it("heads each section with an h2, so the outline never skips a level", () => {
    for (const head of ["Watch a run", "How a run works", "Proof · Arc mainnet"]) {
      expect(src).toContain(`<h2 className="tape-head-title">${head}</h2>`);
    }
    // The example is an illustration, not a section.
    expect(src).toContain("<strong>Payment advice</strong>");
  });
  it("sets the comparison as a list for a phone, from the same rows as the table", () => {
    expect(src).toContain('<dl className="versus-list">');
    expect(src.match(/controlComparison\(\)\.map/g)).toHaveLength(2);
  });
});
