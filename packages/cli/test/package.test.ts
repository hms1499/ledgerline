import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// What `npx arc-reconcile` actually runs: the package as npm would ship it.
// The test script builds dist/ first, so these read the real artifact.
const dir = fileURLToPath(new URL("..", import.meta.url));
const at = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));
const bin = existsSync(at("dist/index.js")) ? readFileSync(at("dist/index.js"), "utf8") : "";

describe("the published arc-reconcile package", () => {
  it("is named for the command it installs, under MIT", () => {
    expect(pkg.name).toBe("arc-reconcile");
    expect(pkg.bin).toEqual({ "arc-reconcile": "dist/index.js" });
    expect(pkg.license).toBe("MIT");
    expect(pkg.engines.node).toBe(">=20");
    expect(pkg.repository.url).toContain("github.com/hms1499/ledgerline");
  });

  it("runs on plain Node, with core bundled in and viem left to npm", () => {
    expect(bin.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(bin).not.toContain("@ledgerline/core");
    expect(bin).toMatch(/from "viem"/);
    expect(pkg.dependencies).toEqual({ viem: expect.any(String) });
  });

  it("ships the built command, its README and the license, and nothing else", () => {
    const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: dir, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const files = (JSON.parse(r.stdout)[0].files as { path: string }[]).map((f) => f.path).sort();
    expect(files).toEqual(["LICENSE", "README.md", "dist/index.js", "package.json"]);
  });

  it("carries the repository's license, word for word", () => {
    expect(readFileSync(at("LICENSE"), "utf8")).toBe(readFileSync(at("../../LICENSE"), "utf8"));
  });

  it("prints its usage and fails when given no transaction", () => {
    const r = spawnSync(process.execPath, [at("dist/index.js")], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^usage: arc-reconcile <txHash>/);
  });
});
