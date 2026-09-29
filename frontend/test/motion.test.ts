import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pageMotion } from "@/lib/motion";

const STYLES = fileURLToPath(new URL("../app/styles/", import.meta.url));
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const css = (name: string) => strip(readFileSync(STYLES + name, "utf8"));
const allCss = () => readdirSync(STYLES).filter((f) => f.endsWith(".css")).map(css).join("\n");
const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

/** A stylesheet's top-level blocks as [prelude, body]; nested braces stay in the body. */
function blocks(text: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0, start = 0, open = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth++ === 0) open = i; }
    else if (text[i] === "}" && --depth === 0) {
      out.push([text.slice(start, open).trim(), text.slice(open + 1, i)]);
      start = i + 1;
    }
  }
  return out;
}
/** The prelude of every top-level block whose body matches `re`. */
const preludesUsing = (re: RegExp) => blocks(allCss()).filter(([, body]) => re.test(body)).map(([p]) => p);

describe("pageMotion — which pages arrive (spec 2026-09-29 §2.1)", () => {
  it("every page but the receipt", () => {
    for (const p of ["/", "/why", "/dashboard", "/runs", "/new", "/run/0xabc"]) expect(pageMotion(p), p).toBe(true);
    for (const p of ["/r/0xabc", "/r"]) expect(pageMotion(p), p).toBe(false);
  });
});

describe("page-in and stagger (spec §2.1–2.2)", () => {
  it("both route groups wrap their pages in a template that asks pageMotion", () => {
    for (const f of ["app/(app)/template.tsx", "app/(public)/template.tsx"]) {
      const text = source(f);
      expect(text, f).toMatch(/pageMotion\(usePathname\(\)\)/);
      expect(text, f).toMatch(/<div className="page-in">\{children\}<\/div>/);
    }
  });

  it("plays only where motion is allowed", () => {
    const preludes = preludesUsing(/animation:[^;]*\bpage-in\b/);
    expect(preludes.length).toBeGreaterThan(0);
    for (const p of preludes) expect(p).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });

  it("fills backwards only, over 350 ms, so a skipped animation shows the page and nothing stays moved", () => {
    const uses = [...allCss().matchAll(/animation:\s*([^;]*\bpage-in\b[^;]*)/g)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u).toMatch(/\bbackwards\b/);
      expect(u).toMatch(/\b350ms\b/);
      expect(u).toMatch(/\bease-out\b/);
    }
  });

  it("moves only opacity and transform, rising 12px", () => {
    const body = blocks(allCss()).find(([p]) => p === "@keyframes page-in")?.[1] ?? "";
    const props = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
    expect([...props].sort()).toEqual(["opacity", "transform"]);
    expect(body).toMatch(/translateY\(12px\)/);
  });

  it("staggers 80 ms a step, so a long page has every block started by 400 ms", () => {
    const delays = [...css("shell.css").matchAll(/\.page-in > \.grid > \.col:nth-child\(([^)]+)\)\s*\{\s*animation-delay:\s*(\d+)ms/g)]
      .map((m) => [m[1], Number(m[2])]);
    expect(delays).toEqual([["2", 80], ["3", 160], ["4", 240], ["5", 320], ["n + 6", 400]]);
  });
});

describe("New's steps enter (spec §2.1)", () => {
  it("each step after the first remounts in a step-in wrapper; the step the page opened on arrives with the page", () => {
    const text = source("app/(app)/new/CreateRun.tsx");
    expect(text).toMatch(/const \[openedOn\] = useState\(step\);/);
    expect(text).toMatch(/if \(!stepMoved && step !== openedOn\) setStepMoved\(true\);/);
    expect(text).toMatch(/<div key=\{step\} className=\{stepMoved \? "step-in" : undefined\}>/);
  });

  it("a verdict opening a step still sits flush with the tape's top, one div deeper", () => {
    // The wrapper has no class on the step the page opened on, so the rule
    // reaches through any first-child wrapper but the tape's own head.
    expect(css("tape.css")).toMatch(
      /\.tape > \.verdict:first-child,\s*\.tape > :not\(\.tape-head\):first-child > \.verdict:first-child\s*\{\s*padding-top:\s*0;\s*\}/);
  });

  it("plays like page-in, where motion is allowed", () => {
    expect(css("shell.css")).toMatch(/\.step-in\s*\{\s*animation:\s*page-in 350ms ease-out backwards;\s*\}/);
    for (const p of preludesUsing(/\.step-in\s*\{/)) expect(p).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });
});
