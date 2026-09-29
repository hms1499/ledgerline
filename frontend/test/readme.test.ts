import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const README = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
const LIVE = "https://ledgerline-chi-sandy.vercel.app/";

// Arc Microgrants takes one link to a live deployment on Arc mainnet; a
// README that names only the contract leaves a reviewer nothing to open.
describe("the README", () => {
  it("links the live app before anything else, and says how to reach testnet", () => {
    const first = README.indexOf(LIVE);
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(README.indexOf("## How it works"));
    expect(README.slice(first, first + 400)).toContain("?n=testnet");
  });

  it("opens the mainnet proof run in that app, where no wallet is needed", () => {
    expect(README).toContain(`${LIVE}run/0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0?n=mainnet`);
  });

  it("tells a Safe treasury how it can pay, and links there from the EOA limitation", () => {
    expect(README).toContain("### Paying from a Safe treasury");
    const limitations = README.slice(README.indexOf("## Limitations"));
    expect(limitations).toContain("(#paying-from-a-safe-treasury)");
  });
});
