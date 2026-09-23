import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

const SOURCES = ["app", "components", "lib"].flatMap((d) => files(join(ROOT, d)));

/** Every line matching `re`, as "file:line: text", so a failure names itself. */
function hits(re: RegExp): string[] {
  return SOURCES.flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((line, i) =>
      re.test(line) ? [`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`] : []));
}

describe("guards that keep fixed mistakes fixed", () => {
  it("no amount guesses its token's decimals", () => {
    expect(hits(/decimals[^\n]{0,40}\?\?\s*\d/)).toEqual([]);
  });
});
