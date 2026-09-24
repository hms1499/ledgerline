import { describe, it, expect } from "vitest";
import { palettes, contrast, tokenCss, type Mode } from "@/lib/theme-tokens";

const MODES: Mode[] = ["light", "dark"];
const TEXTS = ["ink", "inkSoft", "ribbon", "warning"] as const;
const GROUNDS = ["desk", "deskDeep", "tape", "tapeShade"] as const;
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

describe("contrast", () => {
  it("matches WCAG's reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("every palette clears WCAG AA (spec §4.1)", () => {
  for (const mode of MODES) {
    const p = palettes[mode];
    for (const fg of TEXTS) for (const bg of GROUNDS) {
      it(`${mode}: ${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${mode}: the ribbon on its own tint is at least 4.5:1`, () => {
      expect(contrast(p.ribbon, p.ribbonBg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: text on a highlight is at least 4.5:1`, () => {
      expect(contrast(p.onHighlight, p.highlight)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: text on the primary button, at rest and hovered, is at least 4.5:1`, () => {
      expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.onAccent, p.accentHover)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: control edges are at least 3:1 (WCAG 1.4.11)`, () => {
      for (const bg of ["desk", "tape", "tapeShade"] as const) {
        expect(contrast(p.control, p[bg])).toBeGreaterThanOrEqual(3);
      }
    });
    it(`${mode}: the focus ring is at least 3:1 where it is drawn`, () => {
      expect(contrast(p.focus, p.desk)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.focus, p.tape)).toBeGreaterThanOrEqual(3);
    });
    it(`${mode}: a tear shows — tape and desk differ`, () => {
      expect(contrast(p.tape, p.desk)).toBeGreaterThanOrEqual(1.2);
    });
  }

  it("never puts ink on the dark highlighter, which is why onHighlight exists", () => {
    expect(contrast(palettes.dark.ink, palettes.dark.highlight)).toBeLessThan(4.5);
    expect(palettes.dark.onHighlight).toBe(palettes.light.onHighlight);
  });
});

describe("tokenCss", () => {
  it("declares every token for both themes, in kebab case", () => {
    const css = tokenCss();
    expect(css).toContain('html[data-theme="dark"]{color-scheme:dark;');
    expect(css).toContain('html[data-theme="light"]{color-scheme:light;');
    expect(css).toContain("--desk-deep:#D6D3CB");
    expect(css).toContain("--on-highlight:#161616");
    expect(css).toContain("--accent-hover:#CFCDC5");
    for (const mode of MODES) for (const k of Object.keys(palettes[mode])) {
      expect(css).toContain(`--${kebab(k)}:`);
    }
  });
});
