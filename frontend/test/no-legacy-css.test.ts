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
    const css = SOURCES.filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(f, "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const forced = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /outline:\s*2px solid var\(--focus\)\s*!important/.test(body!))
      .flatMap(([, sel]) => sel!.split(",").map((s) => s.trim()));
    for (const needed of [
      "a:focus-visible",
      ".ant-table-row-expand-icon:focus-visible",
      ".ant-table-thead > tr > th.ant-table-column-has-sorters:focus-visible",
    ]) {
      expect(forced).toContain(needed);
    }
  });

  it("no page uses a retired colour name", () => {
    // Part 1's Settlement-blue names, and the pre-redesign ones the tape
    // system did not bring back. --ink, --ink-soft and --rule are real again.
    expect(hits(
      /--(bg|surface|raised|sidebar|border|text|text-soft|link|success|danger|success-bg|warning-bg|danger-bg|ground|tick|flag|pending|ruleStrong)(?![\w-])/,
    )).toEqual([]);
  });

  const CSS = () => SOURCES.filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(f, "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  it("paper is cut square: no rounded corners", () => {
    const radii = [...CSS().matchAll(/border-radius:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !/^0(px)?(\s*!important)?$/.test(v));
    expect(radii).toEqual([]);
    expect(hits(/borderRadius:\s*[1-9]/)).toEqual([]);
  });

  it("text on a highlight is always on-highlight", () => {
    // Ink on the dark highlighter is 1.28:1 (spec §4.1).
    const offenders = [...CSS().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /background(-color)?:\s*var\(--highlight\)/.test(body!))
      .filter(([, , body]) => !/(^|[;\s])color:\s*var\(--on-highlight\)/.test(body!))
      .map(([, sel]) => sel!.trim());
    expect(offenders).toEqual([]);
  });
});
