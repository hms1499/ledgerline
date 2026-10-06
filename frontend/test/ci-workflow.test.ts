import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const CI = "../../.github/workflows/ci.yml";
const ci = existsSync(path(CI)) ? readFileSync(path(CI), "utf8") : "";
const pkg = JSON.parse(readFileSync(path("../../package.json"), "utf8")) as { scripts: Record<string, string> };

// The badge in the README claims these pass on every push. It is only true if
// the workflow still runs each of them, the way a reviewer would.
describe("the CI workflow", () => {
  it("runs on every push to main and every pull request", () => {
    expect(ci).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(ci).toMatch(/pull_request:/);
  });

  it("tests the contract with its libraries checked out", () => {
    expect(ci).toMatch(/submodules:\s*recursive/);
    expect(ci).toMatch(/forge test/);
  });

  it("installs exactly the locked dependencies, then tests, typechecks, lints and builds", () => {
    const steps = ["pnpm install --frozen-lockfile", "pnpm test", "pnpm typecheck", "pnpm lint", "pnpm build"];
    const at = steps.map((s) => ci.indexOf(s));
    expect(at.every((i) => i > -1), steps.filter((_, i) => at[i] === -1).join(", ")).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("needs no secret: nothing it runs can sign or spend", () => {
    expect(ci).not.toMatch(/secrets\./);
    expect(ci).not.toMatch(/PRIVATE_KEY/);
  });
});

describe("pnpm test", () => {
  it("also runs the scripts' own tests, which no package owned", () => {
    expect(pkg.scripts.test).toContain("vitest run --dir scripts");
  });
});
