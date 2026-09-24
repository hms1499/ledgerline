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
