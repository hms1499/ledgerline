import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The result screen is only reached by a confirmed payment, so its promises
// are pinned in its source: one file to keep, then the links to send.
const src = readFileSync(fileURLToPath(new URL("../app/(app)/new/Result.tsx", import.meta.url)), "utf8");

describe("the result screen", () => {
  it("asks the payer to keep one file, not four things", () => {
    expect(src).toContain("RUN_FILE_COPY");
    expect(src).not.toContain("Keep two things");
    expect(src).not.toMatch(/Write it down|writing down/);
  });
  it("says where the run was recorded without the gas figure", () => {
    expect(src).toContain("Recorded in block");
    expect(src).not.toMatch(/gasUsed/);
  });
  it("lets a copied label return to its word", () => {
    expect(src).toMatch(/setTimeout\(\(\) => \{ setCopied\(undefined\); setCopiedAll\(false\); \}, 2000\)/);
  });
});
