import { describe, it, expect } from "vitest";
import { palettes, contrast, tokenCss, type Mode } from "@/lib/theme-tokens";

const MODES: Mode[] = ["dark", "light"];
const TEXTS = ["text", "textSoft", "link", "success", "warning", "danger"] as const;
const GROUNDS = ["bg", "surface", "raised", "sidebar"] as const;

describe("contrast", () => {
  it("matches WCAG's reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("every palette clears WCAG AA", () => {
  for (const mode of MODES) {
    const p = palettes[mode];
    for (const fg of TEXTS) for (const bg of GROUNDS) {
      it(`${mode}: ${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const s of ["success", "warning", "danger"] as const) {
      it(`${mode}: ${s} on its own tinted fill is at least 4.5:1`, () => {
        expect(contrast(p[s], p[`${s}Bg`])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${mode}: text on a primary button is at least 4.5:1`, () => {
      expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: control boundaries are at least 3:1 (WCAG 1.4.11)`, () => {
      expect(contrast(p.control, p.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.control, p.surface)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("tokenCss", () => {
  it("declares every token for both themes, in kebab case", () => {
    const css = tokenCss();
    expect(css).toContain('html[data-theme="dark"]{');
    expect(css).toContain('html[data-theme="light"]{');
    expect(css).toContain("--text-soft:#98A3B8");
    expect(css).toContain("--on-accent:#FFFFFF");
    expect(css).toContain("color-scheme:dark");
  });
});
