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
    expect(hits(/\bdecimals\s*=\s*\d/)).toEqual([]);
  });

  it("antd's own focus ring is replaced wherever a table puts something focusable", () => {
    // Task 10's keyboard check: inside a Panel's table, links and the expand
    // button kept antd's 1.5:1 colorPrimaryBorder ring and a sortable header
    // had no ring at all. Each needs the app's ring, forced over antd's.
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const forced = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /outline:\s*2px solid var\(--success\)\s*!important/.test(body!))
      .flatMap(([, sel]) => sel!.split(",").map((s) => s.trim()));
    for (const needed of [
      "a:focus-visible",
      ".ant-table-row-expand-icon:focus-visible",
      ".ant-table-thead > tr > th.ant-table-column-has-sorters:focus-visible",
    ]) {
      expect(forced).toContain(needed);
    }
  });

  it("no page uses a pre-redesign colour name", () => {
    // --raised is a real token (raised), not one of these aliases.
    expect(hits(/--(ground|ink|ink-soft|rule|ruleStrong|tick|flag|pending)(?![\w-])/)).toEqual([]);
  });
});
