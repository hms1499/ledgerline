import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../app/${path}`, import.meta.url)), "utf8");

describe("in-page Connect buttons (motion polish §3)", () => {
  it("every one shows the wallet is connecting, as the top bar's does", () => {
    // While a wallet's prompt is open these stayed clickable and said nothing.
    for (const f of ["(app)/dashboard/Dashboard.tsx", "(app)/runs/RunHistory.tsx", "(app)/new/StepPreview.tsx"]) {
      const buttons = [...source(f).matchAll(/<Button\b[^>]*>\s*Connect a wallet[^<]*<\/Button>/g)].map((m) => m[0]);
      expect(buttons.length, f).toBeGreaterThan(0);
      for (const b of buttons) expect(b, f).toMatch(/loading=\{connecting\}/);
    }
  });

  it("the Review step is handed the wallet's connecting state", () => {
    expect(source("(app)/new/CreateRun.tsx")).toMatch(/connecting=\{connecting\}/);
  });
});
