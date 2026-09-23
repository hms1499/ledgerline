import { describe, it, expect } from "vitest";
import { checkManifestAgainstRoot } from "../src/completeness.js";
import { USDC_ADDRESS, EURC_ADDRESS } from "../src/constants.js";
import { memoIdFor } from "../src/memo.js";
import { leafFor, buildTree } from "../src/merkle.js";
import type { Manifest } from "../src/types.js";

const SALT = ("0x" + "07".repeat(32)) as `0x${string}`;
const R = "0x2222222222222222222222222222222222222222" as const;

const manifest: Manifest = {
  clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
  payer: "0x1111111111111111111111111111111111111111",
  chainId: 5042,
  runSalt: SALT,
  items: [
    { invoiceId: "A", token: USDC_ADDRESS, to: R, amount: 100_000n },
    { invoiceId: "B", token: EURC_ADDRESS, to: R, amount: 200_000n },
  ],
};

const trueRoot = buildTree(
  manifest.items.map((i) => leafFor(memoIdFor(SALT, i.invoiceId), i.token, i.to, i.amount)),
).root;

describe("checkManifestAgainstRoot", () => {
  it("confirms a manifest that rebuilds the anchored root", () => {
    const c = checkManifestAgainstRoot(manifest, trueRoot);
    expect(c.matches).toBe(true);
    expect(c.computedRoot).toBe(trueRoot);
  });

  it("rejects a manifest with an extra line", () => {
    const tampered: Manifest = {
      ...manifest,
      items: [...manifest.items, { invoiceId: "C", token: USDC_ADDRESS, to: R, amount: 1n }],
    };
    expect(checkManifestAgainstRoot(tampered, trueRoot).matches).toBe(false);
  });

  it("rejects a manifest with one amount changed", () => {
    const tampered: Manifest = {
      ...manifest,
      items: [{ ...manifest.items[0]!, amount: 100_001n }, manifest.items[1]!],
    };
    expect(checkManifestAgainstRoot(tampered, trueRoot).matches).toBe(false);
  });

  it("rejects a manifest carrying the wrong salt", () => {
    const wrongSalt: Manifest = { ...manifest, runSalt: ("0x" + "08".repeat(32)) as `0x${string}` };
    expect(checkManifestAgainstRoot(wrongSalt, trueRoot).matches).toBe(false);
  });

  it("cannot conclude when no root was anchored", () => {
    const c = checkManifestAgainstRoot(manifest, undefined);
    expect(c.matches).toBeUndefined();
    expect(c.note).toMatch(/no recorded list/i);
  });

  it("never throws on a malformed manifest — the page must still render", () => {
    const broken = { ...manifest, items: [] } as Manifest;
    expect(() => checkManifestAgainstRoot(broken, trueRoot)).not.toThrow();
    expect(checkManifestAgainstRoot(broken, trueRoot).matches).toBe(false);
  });
});
