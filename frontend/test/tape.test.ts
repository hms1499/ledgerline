import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tapeClass } from "@/lib/tape";

const STYLES = fileURLToPath(new URL("../app/styles", import.meta.url));
const allCss = () => readdirSync(STYLES).filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(STYLES, f), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

describe("tapeClass", () => {
  it("is a torn tape unless it is still feeding", () => {
    expect(tapeClass()).toBe("tape");
    expect(tapeClass("torn")).toBe("tape");
    expect(tapeClass("feeding")).toBe("tape is-feeding");
  });
  it("keeps a caller's class after its own", () => {
    expect(tapeClass("torn", "receipt")).toBe("tape receipt");
    expect(tapeClass("feeding", "flow")).toBe("tape is-feeding flow");
  });
});

describe("printed decoration", () => {
  it("is silent: every generated glyph carries empty alt text", () => {
    // `content: "*** " / ""` paints the stars and keeps them out of speech (spec §9).
    const contents = [...allCss().matchAll(/(?<![\w-])content:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((c) => c !== '""');
    expect(contents.filter((c) => !/\/\s*""$/.test(c))).toEqual([]);
  });

  it("the verdict stamp and the stars exist", () => {
    const css = allCss();
    expect(css).toContain('content: "*** " / ""');
    expect(css).toContain('content: " ***" / ""');
  });
});

describe("data inside an uppercased control keeps its case", () => {
  it("the wallet chip's keep-case rule outranks the button capitals", () => {
    // Task 12 caught "0X5955…DE17": `html .ant-btn` (0,1,1) beat `.wallet-chip` (0,1,0).
    const antd = readFileSync(join(STYLES, "antd.css"), "utf8");
    expect(antd).toMatch(/html \.ant-btn\.wallet-chip\s*\{[^}]*text-transform:\s*none/);
  });
});

describe("antd's own rules, injected after our sheets", () => {
  it("never outrank a font we set: every such rule is lifted with html", () => {
    // Same specificity, later in the page: a bare `.ant-steps .ant-steps-item-title`
    // lost its 12px to antd's 18px and broke "REVIEW" in two.
    const unlifted = [...allCss().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, sel, body]) => sel!.includes(".ant-") && /font-(size|family|weight)/.test(body!))
      .flatMap(([, sel]) => sel!.split(",").map((s) => s.trim().replace(/\s+/g, " ")))
      .filter((s) => !s.startsWith("html "));
    expect(unlifted).toEqual([]);
  });
});
