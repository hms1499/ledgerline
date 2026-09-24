import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { palettes } from "@/lib/theme-tokens";

const APP = fileURLToPath(new URL("../app", import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return name.endsWith(".css") ? [p] : [];
  });
}

const rules = () => cssFiles(APP)
  .map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))
  .flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]);

describe("the wordmark", () => {
  it("is never hidden outside the sidebar", () => {
    // Part 1 hid `.side-brand` for the collapsed sidebar, and the public
    // header reused the class: below 1024px, public pages had no logo (spec §5.1).
    const hiding = rules()
      .filter(([, , body]) => /display:\s*none/.test(body!))
      .flatMap(([, sel]) => sel!.split(",").map((s) => s.trim()))
      .filter((s) => /\.(side-brand|brand|brand-word)\b/.test(s));
    expect(hiding.filter((s) => !s.startsWith(".side-nav "))).toEqual([]);
  });

  it("the favicon is the ✱ in ink on tape", () => {
    const svg = readFileSync(join(APP, "icon.svg"), "utf8");
    expect(svg.match(/<line /g)).toHaveLength(3);
    expect(svg).toContain(`fill="${palettes.light.tape}"`);
    expect(svg).toContain(`stroke="${palettes.light.ink}"`);
  });
});
