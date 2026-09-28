import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

/**
 * Every file under public/ that the app's source names, such as
 * "/tokens/usdc.png": a path with a folder and a file extension. Routes have
 * no extension, and a bare "/icon.svg" is Next's own file under app/.
 */
function referencedAssets(): string[] {
  const found = new Set<string>();
  const literal = /["'`](\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp|svg|gif|mp4|webm|ico))["'`]/g;
  for (const f of ["app", "components", "lib"].flatMap((d) => files(join(web, d)))) {
    for (const m of readFileSync(f, "utf8").matchAll(literal)) found.add(m[1]!);
  }
  return [...found].sort();
}

function git(args: string[]): { ok: boolean } {
  try { execFileSync("git", args, { cwd: web, stdio: "ignore" }); return { ok: true }; }
  catch { return { ok: false }; }
}
const inGit = git(["rev-parse", "--is-inside-work-tree"]).ok;

/**
 * A deployment is built from git, not from the machine that made the files.
 * The token icons were present on that machine, so every test there passed,
 * and ignored by `*.png`, so every deployment served the home page without
 * them. Existing on disk is not enough: git must carry the file.
 */
describe("every asset the app serves ships with the app", () => {
  const assets = referencedAssets();

  it("finds the assets the pages name", () => {
    expect(assets).toEqual(expect.arrayContaining(["/tokens/usdc.png", "/demo/run-wide-dark.mp4"]));
  });

  it("each one exists under public/", () => {
    expect(assets.filter((a) => !existsSync(join(web, "public", a)))).toEqual([]);
  });

  it.skipIf(!inGit)("git ignores none of them", () => {
    expect(assets.filter((a) => git(["check-ignore", "-q", join("public", a)]).ok)).toEqual([]);
  });

  it.skipIf(!inGit)("git tracks every one, so a build from the repository has it", () => {
    const untracked = assets.filter((a) => !git(["ls-files", "--error-unmatch", join("public", a)]).ok);
    expect(untracked.map((a) => relative(web, join(web, "public", a)))).toEqual([]);
  });
});
