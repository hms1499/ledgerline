# Tape Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Ledgerline's interface as the tape design system — adding-machine paper on a desk — across both shells and all seven routes, without touching core, the payout sequence or any `CLAUDE.md` invariant.

**Architecture:** Tokens first: `lib/theme-tokens.ts` stays the single source for the CSS variables, the antd theme and the contrast test. The one `globals.css` becomes five stylesheets by responsibility under `app/styles/` (base, shell, tape, antd, pages). A `Tape` primitive replaces `Panel`; its bottom edge says whether an answer is final (`torn`) or still printing (`feeding`). Pages keep their logic; only the markup that carries the look changes.

**Tech Stack:** Next.js 16.3.5 (App Router), React 19.3, antd 6.6.5 with `@ant-design/nextjs-registry`, `next/font/google` (Martian Mono with its `wdth` axis, Atkinson Hyperlegible), vitest 2, Playwright MCP with axe-core for browser checks.

**Spec:** `docs/superpowers/specs/2026-09-24-tape-design-system-design.md` (read it first; this plan argues from it).

## Global Constraints

- Work in `frontend/`; every command below runs from `frontend/` unless it says otherwise.
- Colour only through the tokens in `lib/theme-tokens.ts`, as `var(--…)`. No hex literal in CSS or TSX, except `app/icon.svg`. The popup shadow's `rgb(0 0 0 / 0.35)` is the one allowed literal.
- Only labels change case (spec §3.6). Token symbols, addresses, invoice ids and hashes are never uppercased; put `.keep-case` on a data value that sits inside an uppercased element.
- Radius 0 everywhere. Shadow only on popups.
- Mono (`var(--font-mono)`, `font-stretch: 87%`) for figures, codes, labels, buttons and navigation. Sentences use `var(--font-sans)`. No paragraph is set in mono.
- Only exceptions get colour. Success is ink with ✓ and words. `--ribbon` means wrong, short or failed. `--highlight` means look at this; text on it is always `var(--on-highlight)`.
- Decorative glyphs (`✱ ◇ # ***`, dotted leaders) are `aria-hidden="true"` in markup, or CSS `content` with empty alt text: `content: "…" / "";`.
- Screen copy stays free of protocol jargon (`test/plain-language.test.ts`). The contract is "recorded lists", never "anchor" or "PayoutAnchor", on screen.
- Nothing changes in `packages/core`, `lib/wallet-session.ts`, the payout sequence, or any invariant in `CLAUDE.md`.
- Under `prefers-reduced-motion: reduce`, nothing animates.
- Commit at the end of every task. Messages are lower case (`feat(web): …`, `refactor(web): …`, `test(web): …`) and end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- After any Playwright use, empty `.playwright-mcp/` (at the repo root) except `axe.min.js`.
- Browser checks run against a production build: `pnpm build && pnpm start -p 3055`, kept running in its own terminal. Restart it after each rebuild.

## Review Focus

The five inputs most likely to bite a real person that no ordinary unit test covers. Each has its check in the owning task.

1. **A first visit with no theme cookie and a dark OS.** The server renders light, the boot script flips `data-theme` to dark before paint, and nothing is unreadable in between. → Task 1 (`resolveTheme` tests) and Task 12 (`curl`, plus a dark first-visit screenshot).
2. **Data inside an uppercased label**, such as `cirBTC` in a totals line, an address in the wallet chip, or an invoice id in a tape head. It must keep its case. → Task 6 (computed `text-transform` on the receipt's data) and Task 12 (the same check on `/run` and the wallet chip).
3. **Text on a highlight in dark mode.** Ink on the dark highlighter is 1.28:1. Every rule that paints `--highlight` must also set `--on-highlight`. → Task 5 (CSS guard test).
4. **A long value in a narrow tape**: an 8-decimal cirBTC amount or a long check label on a 390px receipt, or the Split aside at 1024px. It must wrap, never scroll the page sideways. → Task 6 (a long amount and label injected into the 390px slip) and Task 12 (every route at every width).
5. **The home page's proof figures drifting from what was measured.** → Task 7 (`test/mainnet-proof.test.ts` against the note, the README and the verifier).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `lib/theme-tokens.ts` | The two palettes, `contrast()`, `tokenCss()` | 1 |
| `lib/theme.ts` | Theme cookies, `resolveTheme` (light default), `antdTheme` | 1, 5 |
| `app/styles/base.css` | Variables that are not colours, reset, links, focus ring, type roles, utilities | 3 |
| `app/styles/shell.css` | Frame, grid, brand, app shell, public shell, network badge, bottom tabs | 3 |
| `app/styles/tape.css` | Tape, tape head, leaders, key marks, totals, stat tile, verdict stamp, printed checks, ledger line | 4 |
| `app/styles/antd.css` | What antd's tokens cannot reach | 5 |
| `app/styles/pages.css` | Page-level rules: receipt, home, proof, footers, create flow, dashboard | 3, then 4–11 |
| `components/ui/Mark.tsx` | The ✱ | 2 |
| `components/shell/Brand.tsx` | `✱ LEDGERLINE` link | 2 |
| `lib/tape.ts`, `components/ui/Tape.tsx` | The tape primitive (replaces `Panel.tsx`) | 4 |
| `components/ui/Totals.tsx` | ◇ lines per token, optional ✱ line | 4 |
| `lib/mainnet-proof.ts` | The measured mainnet figures | 7 |
| `lib/site-footer.ts`, `components/ui/SiteFooter.tsx` | The end-of-roll footer on `/` and `/why` | 7 |

---

### Task 1: Tokens and theme infrastructure

**Files:**
- Modify: `frontend/lib/theme-tokens.ts` (whole file)
- Modify: `frontend/lib/theme.ts:8-69` (`resolveTheme` doc and body, `antdTheme`)
- Modify: `frontend/test/theme-tokens.test.ts` (whole file)
- Modify: `frontend/test/theme.test.ts:5-40`
- Modify: `frontend/test/no-legacy-css.test.ts` (focus-ring and colour-name guards)
- Modify: variable names in `frontend/app/globals.css`, `app/(app)/dashboard/Dashboard.tsx`, `app/(app)/new/StepUpload.tsx`, `app/(app)/run/[txHash]/Reconciliation.tsx`, `app/(app)/runs/RunHistory.tsx`, `app/(public)/why/Why.tsx`

**Interfaces:**
- Produces: `Palette` with keys `desk, deskDeep, tape, tapeShade, rule, control, ink, inkSoft, ribbon, ribbonBg, highlight, onHighlight, warning, accent, accentHover, onAccent, focus`. CSS variables are the same names in kebab case (`--desk-deep`, `--on-highlight`, …). `resolveTheme()` returns `mode: "light"` when there is no cookie.

- [ ] **Step 1: Write the failing token test**

Replace `frontend/test/theme-tokens.test.ts` with:

```ts
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
```

- [ ] **Step 2: Update the theme test for the light default and the new names**

In `frontend/test/theme.test.ts`, replace the `describe("resolveTheme", …)` and `describe("antdTheme", …)` blocks (lines 5-40) with:

```ts
describe("resolveTheme", () => {
  it("honours an explicit choice whatever the system says", () => {
    expect(resolveTheme("light", "dark")).toEqual({ choice: "light", mode: "light" });
    expect(resolveTheme("dark", "light")).toEqual({ choice: "dark", mode: "dark" });
  });
  it("follows the recorded system value when the choice is system or missing", () => {
    expect(resolveTheme("system", "light")).toEqual({ choice: "system", mode: "light" });
    expect(resolveTheme("system", "dark")).toEqual({ choice: "system", mode: "dark" });
    expect(resolveTheme(undefined, "dark")).toEqual({ choice: "system", mode: "dark" });
  });
  it("renders light on a first visit, before the system value is known", () => {
    expect(resolveTheme(undefined, undefined)).toEqual({ choice: "system", mode: "light" });
  });
  it("treats a garbage or hostile cookie as system, never echoing it", () => {
    const r = resolveTheme("</script><script>alert(1)", "<b>");
    expect(r).toEqual({ choice: "system", mode: "light" });
  });
});

describe("antdTheme", () => {
  it("uses the dark algorithm and the dark palette in dark mode", () => {
    const t = antdTheme("dark");
    expect(t.algorithm).toBe(antd.darkAlgorithm);
    expect(t.token?.colorPrimary).toBe(palettes.dark.accent);
    expect(t.token?.colorLink).toBe(palettes.dark.ink);
    expect(t.token?.colorBgBase).toBe(palettes.dark.desk);
    expect(t.token?.colorBgContainer).toBe(palettes.dark.tape);
    expect(t.token?.colorTextSecondary).toBe(palettes.dark.inkSoft);
    expect(t.token?.colorError).toBe(palettes.dark.ribbon);
  });
  it("uses the default algorithm and the light palette in light mode", () => {
    const t = antdTheme("light");
    expect(t.algorithm).toBe(antd.defaultAlgorithm);
    expect(t.token?.colorText).toBe(palettes.light.ink);
  });
  it("gives success no colour of its own: only exceptions get colour", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(antdTheme(mode).token?.colorSuccess).toBe(palettes[mode].ink);
    }
  });
});
```

Leave the rest of the file (the `BOOT_SCRIPT` and `themeCookie` tests) as it is.

- [ ] **Step 3: Run both tests and watch them fail**

Run: `pnpm vitest run test/theme-tokens.test.ts test/theme.test.ts`
Expected: FAIL. TypeScript reports `desk`, `ink` and the other keys missing on `Palette`, and `resolveTheme(undefined, undefined)` returns `mode: "dark"`.

- [ ] **Step 4: Write the palettes**

Replace `frontend/lib/theme-tokens.ts` with:

```ts
/**
 * The single source of colour for the tape design system (spec
 * docs/superpowers/specs/2026-09-24-tape-design-system-design.md §4.1).
 * CSS variables, the antd theme and the contrast test all read from here, so
 * a colour cannot drift between them. test/theme-tokens.test.ts keeps every
 * pair above WCAG AA.
 */
export type Mode = "dark" | "light";

export interface Palette {
  /** The page: the desk the tape lies on. */
  desk: string;
  /** Sidebar and bottom tabs. */
  deskDeep: string;
  /** Every block: paper from the roll. */
  tape: string;
  /** Row hover, selected items, code on tape. */
  tapeShade: string;
  /** Dotted leaders and separators. Decorative only — WCAG exempts them. */
  rule: string;
  /** Edges a user must see to operate: inputs, outline buttons, chips. ≥ 3:1. */
  control: string;
  ink: string;
  inkSoft: string;
  /** The adding machine's red ribbon: wrong, short, failed. */
  ribbon: string;
  ribbonBg: string;
  /** Look at this. A fill only; text on it is always onHighlight. */
  highlight: string;
  onHighlight: string;
  /** antd's warning icons, nothing else. */
  warning: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  focus: string;
}

export const palettes: Record<Mode, Palette> = {
  light: {
    desk: "#E2E0DA", deskDeep: "#D6D3CB", tape: "#FDFDFA", tapeShade: "#F0EEE8",
    rule: "#B9B7B0", control: "#77756D",
    ink: "#161616", inkSoft: "#55544F",
    ribbon: "#AC0D26", ribbonBg: "#FBE4E6",
    highlight: "#FFE45C", onHighlight: "#161616",
    warning: "#6E5200",
    accent: "#161616", accentHover: "#3A3935", onAccent: "#FDFDFA",
    focus: "#161616",
  },
  dark: {
    desk: "#121211", deskDeep: "#0B0B0A", tape: "#262521", tapeShade: "#31302B",
    rule: "#45433D", control: "#8A877E",
    ink: "#F2F1EC", inkSoft: "#AEACA3",
    ribbon: "#FF7A7A", ribbonBg: "#3D1C1E",
    highlight: "#F4D63D", onHighlight: "#161616",
    warning: "#F4D63D",
    accent: "#F2F1EC", accentHover: "#CFCDC5", onAccent: "#121211",
    focus: "#F2F1EC",
  },
};

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
export function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Both themes as CSS custom properties, keyed on html[data-theme]. */
export function tokenCss(): string {
  return (["dark", "light"] as const).map((mode) => {
    const vars = Object.entries(palettes[mode]).map(([k, v]) => `--${kebab(k)}:${v}`).join(";");
    return `html[data-theme="${mode}"]{color-scheme:${mode};${vars}}`;
  }).join("");
}
```

- [ ] **Step 5: Make light the default and map antd to the new palette**

In `frontend/lib/theme.ts`, replace the `resolveTheme` doc comment and body (lines 8-20) with:

```ts
/**
 * What the server renders. Only two fixed strings ever leave this function,
 * so nothing from a cookie can reach the HTML. Missing or unknown means
 * "system"; system with no recorded value is light, the product default
 * (tape spec §10): paper on a desk is a light-first world.
 */
export function resolveTheme(
  themeCookie?: string | null, systemCookie?: string | null,
): { choice: ThemeChoice; mode: Mode } {
  const choice: ThemeChoice =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : "system";
  if (choice !== "system") return { choice, mode: choice };
  return { choice, mode: systemCookie === "dark" ? "dark" : "light" };
}
```

and replace `antdTheme` (lines 26-69) with:

```ts
/** antd computes colour in JS; these tokens pin it to our palette. Task 5 of
 *  the tape plan adds shape, faces and the component tokens. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorLink: p.ink,
      colorInfo: p.ink,
      // Only exceptions get colour: a success is black ink with ✓ and words.
      colorSuccess: p.ink,
      colorWarning: p.warning,
      colorError: p.ribbon,
      colorText: p.ink,
      colorTextSecondary: p.inkSoft,
      colorTextTertiary: p.inkSoft,
      colorTextDescription: p.inkSoft,
      colorTextPlaceholder: p.inkSoft,
      colorTextLightSolid: p.onAccent,
      colorBgBase: p.desk,
      colorBgLayout: p.desk,
      colorBgContainer: p.tape,
      colorBgElevated: p.tape,
      colorBorder: p.control,
      colorBorderSecondary: p.rule,
      colorSuccessBg: p.tapeShade,
      colorWarningBg: p.highlight,
      colorErrorBg: p.ribbonBg,
      colorInfoBg: p.tapeShade,
      borderRadius: 6,
      fontFamily: "var(--font-sans)",
      fontSize: 15,
      lineHeight: 1.6,
    },
    components: {
      Table: { headerBg: p.tape, rowHoverBg: p.tapeShade, borderColor: p.rule, footerBg: p.tape },
      Tag: { defaultBg: p.tapeShade, defaultColor: p.ink },
      Alert: {
        colorInfoBorder: p.rule, colorSuccessBorder: p.rule,
        colorWarningBorder: p.rule, colorErrorBorder: p.rule,
      },
      Steps: { colorTextDescription: p.inkSoft },
    },
  };
}
```

- [ ] **Step 6: Run the two tests and watch them pass**

Run: `pnpm vitest run test/theme-tokens.test.ts test/theme.test.ts`
Expected: PASS, every case.

- [ ] **Step 7: Rename the variables the stylesheet and pages use**

Run:

```bash
perl -pi -e '
  s/outline: 2px solid var\(--success\)/outline: 2px solid var(--focus)/g;
  s/var\(--text-soft\)/var(--ink-soft)/g;
  s/var\(--text\)/var(--ink)/g;
  s/var\(--link\)/var(--ink)/g;
  s/var\(--success-bg\)/var(--tape-shade)/g;
  s/var\(--warning-bg\)/var(--highlight)/g;
  s/var\(--danger-bg\)/var(--ribbon-bg)/g;
  s/var\(--success\)/var(--ink)/g;
  s/var\(--danger\)/var(--ribbon)/g;
  s/var\(--bg\)/var(--desk)/g;
  s/var\(--surface\)/var(--tape)/g;
  s/var\(--raised\)/var(--tape-shade)/g;
  s/var\(--sidebar\)/var(--desk-deep)/g;
  s/var\(--border\)/var(--rule)/g;
' app/globals.css "app/(app)/dashboard/Dashboard.tsx" "app/(app)/new/StepUpload.tsx" \
  "app/(app)/run/[txHash]/Reconciliation.tsx" "app/(app)/runs/RunHistory.tsx" "app/(public)/why/Why.tsx"
```

The testnet badge now sits on the highlighter, so its text must use `--on-highlight` (the dark highlighter and dark `--warning` are the same colour). In `app/globals.css`, replace:

```css
.network-badge.is-test { background: var(--highlight); color: var(--warning); border-color: var(--warning); }
```

with:

```css
.network-badge.is-test { background: var(--highlight); color: var(--on-highlight); border-color: var(--highlight); }
```

- [ ] **Step 8: Point the guards at the new names**

In `frontend/test/no-legacy-css.test.ts`, change the focus-ring test so that it reads every stylesheet under `app/` (Task 3 splits the one file into several) and looks for `--focus`. Replace its first two statements:

```ts
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const forced = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /outline:\s*2px solid var\(--success\)\s*!important/.test(body!))
```

with:

```ts
    const css = SOURCES.filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(f, "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const forced = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /outline:\s*2px solid var\(--focus\)\s*!important/.test(body!))
```

and replace the last test (`"no page uses a pre-redesign colour name"`) with:

```ts
  it("no page uses a retired colour name", () => {
    // Part 1's Settlement-blue names, and the pre-redesign ones the tape
    // system did not bring back. --ink, --ink-soft and --rule are real again.
    expect(hits(
      /--(bg|surface|raised|sidebar|border|text|text-soft|link|success|danger|success-bg|warning-bg|danger-bg|ground|tick|flag|pending|ruleStrong)(?![\w-])/,
    )).toEqual([]);
  });
```

- [ ] **Step 9: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; `tsc` reports nothing.

Run: `grep -rnE "var\(--(bg|surface|raised|sidebar|border|text|link|success|danger)\)" app components lib`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/theme-tokens.ts frontend/lib/theme.ts frontend/test/theme-tokens.test.ts \
  frontend/test/theme.test.ts frontend/test/no-legacy-css.test.ts frontend/app/globals.css \
  "frontend/app/(app)" "frontend/app/(public)/why/Why.tsx"
git commit -m "feat(web): the tape palette, light by default, two inks and a highlighter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fonts, the ✱, the favicon and the wordmark

**Files:**
- Modify: `frontend/app/layout.tsx:3,10-11`
- Create: `frontend/components/ui/Mark.tsx`
- Create: `frontend/components/shell/Brand.tsx`
- Modify: `frontend/components/shell/SideNav.tsx:30`, `frontend/components/shell/PublicShell.tsx:18`
- Replace: `frontend/app/icon.svg`
- Modify: `frontend/app/globals.css` (the `.side-brand` rule and the `md` hide rule)
- Test: `frontend/test/brand.test.ts`

**Interfaces:**
- Consumes: `palettes` from Task 1.
- Produces: `<Mark size?: number />` (decorative SVG, class `brand-mark`). `<Brand href: string onClick?: MouseEventHandler />` renders `a.brand > svg.brand-mark + span.brand-word`. `--font-sans` is Atkinson Hyperlegible; `--font-mono` is Martian Mono with `wdth` 75–112.5.

- [ ] **Step 1: Write the failing test**

Create `frontend/test/brand.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/brand.test.ts`
Expected: FAIL. The first test lists `.side-brand`; the second finds no `<line` in the old favicon.

- [ ] **Step 3: The ✱ and the wordmark**

Create `frontend/components/ui/Mark.tsx`:

```tsx
/**
 * The ✱: an adding machine's total key, the final answer (spec §6.3). Three
 * square-capped bars at 0°, 60° and 120°. Decorative wherever it sits beside
 * the word "Ledgerline".
 */
export default function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32"
      aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="5.2" strokeLinecap="butt">
        <line x1="16" y1="3" x2="16" y2="29" />
        <line x1="4.7" y1="9.5" x2="27.3" y2="22.5" />
        <line x1="4.7" y1="22.5" x2="27.3" y2="9.5" />
      </g>
    </svg>
  );
}
```

Create `frontend/components/shell/Brand.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import Mark from "@/components/ui/Mark";

/** ✱ LEDGERLINE. Its own class, so no shell's rule can hide another shell's logo. */
export default function Brand({ href, onClick }: { href: string; onClick?: MouseEventHandler }) {
  return (
    <Link href={href} onClick={onClick} className="brand">
      <Mark size={15} />
      <span className="brand-word">Ledgerline</span>
    </Link>
  );
}
```

In `frontend/components/shell/SideNav.tsx`, add `import Brand from "./Brand";` and replace:

```tsx
      <Link href={withNet("/", search)} onClick={guard} className="side-brand">Ledgerline</Link>
```

with:

```tsx
      <Brand href={withNet("/", search)} onClick={guard} />
```

In `frontend/components/shell/PublicShell.tsx`, add `import Brand from "./Brand";` and replace:

```tsx
          <Link href={withNet("/", search)} className="side-brand">Ledgerline</Link>
```

with:

```tsx
          <Brand href={withNet("/", search)} />
```

- [ ] **Step 4: The favicon**

Replace `frontend/app/icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#FDFDFA"/>
  <g stroke="#161616" stroke-width="5.2">
    <line x1="16" y1="4" x2="16" y2="28"/>
    <line x1="5.6" y1="10" x2="26.4" y2="22"/>
    <line x1="5.6" y1="22" x2="26.4" y2="10"/>
  </g>
</svg>
```

- [ ] **Step 5: The faces**

In `frontend/app/layout.tsx`, replace the font import and the two font constants:

```tsx
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
```
```tsx
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
```

with:

```tsx
import { Atkinson_Hyperlegible, Martian_Mono } from "next/font/google";
```
```tsx
// Atkinson for sentences. Martian, variable with its width axis, for all the
// machine prints: labels at 87% width, amounts at 100% (spec §4.3).
const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans" });
const mono = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mono" });
```

- [ ] **Step 6: Style the wordmark and stop hiding it outside the sidebar**

In `frontend/app/globals.css`, replace:

```css
.side-brand { font-weight: 600; font-size: 1rem; color: var(--ink); text-decoration: none; padding: 4px 10px 16px; }
```

with:

```css
.brand {
  display: inline-flex; align-items: center; gap: 9px;
  color: var(--ink); text-decoration: none;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 14px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
}
.side-nav .brand { padding: 4px 10px 16px; }
```

and, in the `@media (max-width: 1023px)` block, replace:

```css
  .side-brand, .nav-group, .side-foot { display: none; }
```

with:

```css
  .side-nav .brand-word, .nav-group, .side-foot { display: none; }
```

- [ ] **Step 7: Run the tests, the typecheck and the build**

Run: `pnpm vitest run test/brand.test.ts && pnpm test && pnpm typecheck && pnpm build`
Expected: all pass; the build prints the route table with no errors. A build error naming `Atkinson_Hyperlegible` or `axes` means the font call is wrong. `next/font` data for Next 16.3.5 lists `wdth` 75–112.5 for Martian Mono.

- [ ] **Step 8: Check it in a browser**

Start `pnpm start -p 3055`. With the Playwright MCP, at 1280×900 open `http://localhost:3055/` and run:

```js
async (page) => page.evaluate(() => ({
  brand: getComputedStyle(document.querySelector(".brand")).fontFamily,
  mono: [...document.fonts].filter((f) => /Martian/i.test(f.family)).map((f) => f.stretch),
}))
```

Expected: `brand` names the Martian face; `mono` includes a range such as `"75% 112.5%"`. Resize to 768×900 and 390×844 and take a screenshot of the header at each: the ✱ LEDGERLINE wordmark is visible. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/icon.svg frontend/app/globals.css \
  frontend/components/ui/Mark.tsx frontend/components/shell/Brand.tsx \
  frontend/components/shell/SideNav.tsx frontend/components/shell/PublicShell.tsx frontend/test/brand.test.ts
git commit -m "feat(web): the total key as the logo, Martian and Atkinson, and a public logo at every width

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One frame, stylesheets by responsibility, the shells

**Files:**
- Create: `frontend/app/styles/base.css`, `frontend/app/styles/shell.css`, `frontend/app/styles/pages.css`
- Delete: `frontend/app/globals.css`
- Modify: `frontend/app/layout.tsx` (stylesheet imports)
- Modify: `frontend/components/shell/AppShell.tsx`, `TopBar.tsx`, `PublicShell.tsx`, `SideNav.tsx`, `icons.tsx`
- Test: `frontend/test/frame.test.ts`

**Interfaces:**
- Consumes: `Brand` (Task 2).
- Produces:
  - Classes: `.frame`, `.label`, `.keep-case`, `.hl`, `.button-primary`, `.nav-link`, `.brand`.
  - Variables: `--gutter`, `--gap`, `--tape-pad`, `--edge`.
  - Every page renders inside `main > .frame`.
  - `pages.css` sections named `── the ledger line`, `── verdict`, `── the tickmark ladder`, `── home`, `── trust footer`, `── funding`, `── wallet picker`, `── wallet chip`, `── stat tiles`, `── dashboard`, `── panels`, `── create flow`. Later tasks edit these sections by name.

- [ ] **Step 1: Write the failing test**

Create `frontend/test/frame.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const rule = (css: string, selector: string) =>
  css.match(new RegExp(`(^|\\n)${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))?.[2] ?? "";

describe("one frame for every page (spec §5.2)", () => {
  it("the frame holds the width, and the grid does not", () => {
    const shell = read("../app/styles/shell.css");
    expect(rule(shell, ".frame")).toContain("max-width: calc(1200px + 2 * var(--gutter))");
    expect(rule(shell, ".grid")).not.toContain("max-width");
  });

  it("both shells put the header and the page in the same frame", () => {
    expect(read("../components/shell/TopBar.tsx")).toContain('className="frame top-bar-inner"');
    expect(read("../components/shell/AppShell.tsx")).toContain('<div className="frame">{children}</div>');
    const pub = read("../components/shell/PublicShell.tsx");
    expect(pub).toContain('className="frame public-bar-inner"');
    expect(pub).toContain('<div className="frame">{children}</div>');
  });

  it("one stylesheet per responsibility, and the old single file is gone", () => {
    expect(existsSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)))).toBe(false);
    const layout = read("../app/layout.tsx");
    for (const f of ["base", "shell", "pages"]) expect(layout).toContain(`import "./styles/${f}.css";`);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/frame.test.ts`
Expected: FAIL with `ENOENT` for `app/styles/shell.css`.

- [ ] **Step 3: Write `app/styles/base.css`**

```css
/* The tape design system: base (spec §4). Colours arrive from
   lib/theme-tokens.ts as html[data-theme] variables; nothing here names a
   colour of its own. */
:root {
  --measure: 62ch;
  /* Spec §5.2: one frame, a three-step gutter. */
  --gutter: 32px;
  --gap: 24px;
  /* A tape's inner padding; a table inside bleeds to it (§5.2 rule 4). */
  --tape-pad: 20px;
  /* A torn edge's height. The gap between tapes must exceed two of them. */
  --edge: 6px;
}
@media (max-width: 1023px) { :root { --gutter: 24px; } }
@media (max-width: 639px) { :root { --gutter: 16px; --gap: 16px; --tape-pad: 16px; } }

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--desk);
  color: var(--ink);
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  /* The whole product is figures; tabular by default keeps columns honest. */
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--ink); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
/* antd styles a link inside an Alert by colour alone, which axe flags
   (link-in-text-block): the underline is what marks it as a link. */
.ant-alert a { text-decoration: underline; }

/* One focus ring, in ink. antd draws its own ring in colorPrimaryBorder,
   under the 3:1 a focus indicator needs, so it is forced here. The segmented
   control focuses a zero-width radio, so ring its label. antd rings a link,
   and a table's expand button, the same way; a sortable column header it
   rings not at all (outline: none). */
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ant-btn:not(:disabled):focus-visible,
.ant-segmented:focus-visible,
.ant-segmented-item:has(input:focus-visible),
a:focus-visible,
.ant-table-row-expand-icon:focus-visible {
  outline: 2px solid var(--focus) !important;
  outline-offset: 2px !important;
}
/* Inset: the header sits against the table's scroll edge, which would clip
   an outside ring. */
.ant-table-thead > tr > th.ant-table-column-has-sorters:focus-visible {
  outline: 2px solid var(--focus) !important;
  outline-offset: -2px !important;
}

/* ── type roles (spec §4.3) ───────────────────────────────────────────── */
.mono, .hex, code, pre { font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; }
:is(p, li, dd, td, span) > code { font-size: 0.92em; }
.hex { font-size: 0.92em; word-break: break-all; }
/* A shortened address never breaks mid-string ("0xe48A…7 / 32a"). */
.hex.addr { word-break: normal; white-space: nowrap; }
/* A reason in a token's own words: monospace like a hex, but prose, so it
   wraps at spaces rather than mid-word. */
.raw-reason { display: block; font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 0.92em; }
.label {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-soft);
}
/* Only labels change case; data never does (spec §3.6). */
.keep-case { text-transform: none; letter-spacing: normal; }
/* The highlighter: a full background, so dark text never falls off it. */
mark, .hl {
  background: var(--highlight);
  color: var(--on-highlight);
  padding: 0 0.2em;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.because { display: block; margin-top: 4px; font-size: 13px; color: var(--ink-soft); max-width: var(--measure); }
p.because { margin-bottom: 0; }
.endpoint { font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 0.92em; }

/* ── controls that are not antd's ─────────────────────────────────────── */
.button-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  text-decoration: none;
}
.button-primary:hover { background: var(--accent-hover); color: var(--on-accent); text-decoration: none; }
@media (prefers-reduced-motion: no-preference) {
  .button-primary:active { transform: translateY(1px); }
}
.linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.linkish:hover { text-decoration-thickness: 2px; }
/* A disconnect that is temporarily unsafe still has to look like a control,
   not like a link that stopped working. */
.linkish:disabled { color: var(--ink-soft); cursor: not-allowed; text-decoration: none; }

dl.detail { margin: 0; display: grid; grid-template-columns: minmax(8rem, auto) 1fr; gap: 6px 20px; font-size: 14px; }
dl.detail dt {
  padding-top: 3px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft);
}
dl.detail dd { margin: 0; min-width: 0; }

/* Announced to screen readers, never painted. */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 16px; top: 12px; z-index: 100; background: var(--tape); padding: 8px 12px; }
```

- [ ] **Step 4: Write `app/styles/shell.css`**

```css
/* The tape design system: the frame, the grid and the shells (spec §5, §6.5). */

/* ── the frame: logo, page title and content share one left edge ─────── */
.frame { width: 100%; max-width: calc(1200px + 2 * var(--gutter)); margin-inline: auto; padding-inline: var(--gutter); }

/* ── 12-column grid, inside a frame (lib/grid.ts sets the variables) ──── */
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--gap); width: 100%; }
.grid.is-dense { grid-auto-flow: row dense; }
.col { min-width: 0; grid-column: var(--start) / span var(--span); }
@media (min-width: 1024px) {
  .col.is-sticky { position: sticky; top: 88px; align-self: start; }
}
@media (max-width: 1023px) {
  .col { grid-column: var(--md-start) / span var(--md-span); }
}
@media (max-width: 639px) {
  .col { grid-column: var(--sm-start) / span var(--sm-span); }
}

/* ── brand: ✱ LEDGERLINE ──────────────────────────────────────────────── */
.brand {
  display: inline-flex; align-items: center; gap: 9px;
  color: var(--ink); text-decoration: none;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 14px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
}
.brand:hover { text-decoration: none; }

/* ── app shell ────────────────────────────────────────────────────────── */
.app-shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.side-nav {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; gap: 2px;
  padding: 20px 16px;
  background: var(--desk-deep);
  border-right: 1px solid var(--rule);
}
.side-nav .brand { padding: 0 8px 22px; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px;
  color: var(--ink-soft); text-decoration: none;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
}
.nav-item:hover { background: var(--tape-shade); color: var(--ink); text-decoration: none; }
.nav-item[aria-current="page"] { background: var(--tape); color: var(--ink); font-weight: 600; }
.nav-item[aria-current="page"] .nav-label::before { content: "▸ " / ""; }
.nav-group { margin: 20px 8px 4px; }
.side-foot { margin-top: auto; padding-top: 8px; }

.app-body { min-width: 0; display: flex; flex-direction: column; }
.top-bar { position: sticky; top: 0; z-index: 10; background: var(--desk); border-bottom: 1px solid var(--rule); }
.top-bar-inner { height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.top-title {
  margin: 0; min-width: 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 14px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.top-actions { display: flex; align-items: center; gap: 10px; }
.app-main { padding-block: 32px 56px; }

/* ── public shell ─────────────────────────────────────────────────────── */
.public-bar { background: var(--desk); border-bottom: 1px solid var(--rule); }
.public-bar-inner { height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.public-links { display: flex; align-items: center; gap: 16px; }
.nav-link {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none;
}
.nav-link:hover { text-decoration: underline; }
.public-bar .button-primary { padding: 8px 12px; font-size: 11px; }
.public-main { padding-block: 40px 64px; }

/* ── network badge: testnet sits on the highlighter ───────────────────── */
.network-badge {
  padding: 5px 8px;
  border: 1px solid var(--control);
  color: var(--ink-soft);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 500; line-height: 1; letter-spacing: 0.06em; text-transform: uppercase;
  white-space: nowrap;
}
.network-badge.is-test { background: var(--highlight); color: var(--on-highlight); border-color: var(--highlight); }

.only-sm { display: none; }
.bottom-tabs { display: none; }

/* md: the sidebar collapses to icons, and keeps the ✱. Labels are tooltips
   on hover and visible text on keyboard focus. */
@media (max-width: 1023px) {
  .app-shell { grid-template-columns: 64px minmax(0, 1fr); }
  .side-nav { padding: 20px 8px; align-items: center; }
  .side-nav .brand { padding: 0 0 22px; }
  .side-nav .brand-word, .nav-group, .side-foot { display: none; }
  .nav-item { position: relative; justify-content: center; }
  .nav-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .nav-item:focus-visible .nav-label {
    width: auto; height: auto; clip-path: none; left: 56px;
    background: var(--tape); border: 1px solid var(--control);
    padding: 4px 8px; color: var(--ink); z-index: 30;
  }
}

/* sm: no sidebar; bottom tabs and the ⋯ menu take over. */
@media (max-width: 639px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); }
  .side-nav { display: none; }
  .app-main { padding-bottom: 96px; }
  .public-main { padding-block: 24px 48px; }
  .only-sm { display: inline-flex; }
  .hide-sm { display: none; }
  .network-badge { font-size: 10px; padding: 4px 6px; }
  .bottom-tabs {
    display: grid; grid-template-columns: repeat(3, 1fr);
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    background: var(--desk-deep); border-top: 1px solid var(--rule);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bottom-tabs .tab {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 8px 0 10px; margin-top: -1px; border-top: 2px solid transparent;
    color: var(--ink-soft); text-decoration: none;
    font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
    font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .bottom-tabs .tab[aria-current="page"] { color: var(--ink); border-top-color: var(--ink); }
  .step-line { margin: 4px 0 0; color: var(--ink-soft); font-size: 14px; }
}
```

- [ ] **Step 5: Write `app/styles/pages.css`, carrying over what the pages still use**

These are the old page-level rules, with Task 1's names. Later tasks replace them section by section.

```css
/* The tape design system: page-level rules. Sections carried over from part 1
   of the redesign are rebuilt by plan Tasks 4–11, which name them below. */

/* ── the ledger line ──────────────────────────────────────────────────── */
.line { display: flex; justify-content: space-between; align-items: flex-end; gap: 1.5rem; flex-wrap: wrap; padding: 2.2rem 0 1.4rem; border-bottom: 2px solid var(--ink); }
.amount { font-family: var(--font-mono), ui-monospace, monospace; font-size: clamp(2.1rem, 7vw, 3.1rem); font-weight: 500; letter-spacing: -0.03em; line-height: 1; margin: 0; }
.amount .unit { font-size: 0.42em; font-weight: 400; margin-left: 0.5em; letter-spacing: 0; }
.amount.is-absent { font-family: var(--font-sans), system-ui, sans-serif; font-size: clamp(1.3rem, 4vw, 1.75rem); font-weight: 500; color: var(--ink-soft); letter-spacing: -0.02em; }
.line--summary .amount .unit { font-size: 0.34em; }
.payee { margin: 0.55rem 0 0; font-size: 0.87rem; color: var(--ink-soft); }
.reference { font-family: var(--font-mono), ui-monospace, monospace; font-size: 1rem; padding-bottom: 0.3rem; border-bottom: 2px solid var(--ink); }
.reference.is-void { border-bottom-color: var(--ribbon); }

/* ── verdict ──────────────────────────────────────────────────────────── */
.verdict { padding: 1.9rem 0 0.4rem; }
.verdict :is(h1, h2) { font-size: 1.45rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 0.45rem; }
.verdict p { margin: 0; max-width: var(--measure); color: var(--ink-soft); }
.verdict.ok :is(h1, h2) { color: var(--ink); }
.verdict.error :is(h1, h2), .verdict.critical :is(h1, h2) { color: var(--ribbon); }
.verdict.degraded :is(h1, h2) { color: var(--warning); }

/* ── the tickmark ladder ──────────────────────────────────────────────── */
.ladder { list-style: none; margin: 2rem 0 0; padding: 0; }
.rung { position: relative; padding: 0.62rem 0 0.62rem 2rem; border-top: 1px solid var(--rule); }
.rung:last-child { border-bottom: 1px solid var(--rule); }
.rung .mark { position: absolute; left: 0; top: 0.62rem; font-family: var(--font-mono), ui-monospace, monospace; font-size: 1rem; line-height: 1.6; }
.rung.pass .mark { color: var(--ink); }
.rung.fail .mark { color: var(--ribbon); }
.rung.skipped .mark { color: var(--warning); }
.rung.skipped .claim { color: var(--ink-soft); }
.claim { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .rung { animation: settle 340ms ease-out both; }
}
@keyframes settle { from { opacity: 0; } to { opacity: 1; } }

/* ── home ─────────────────────────────────────────────────────────────── */
.home-actions { display: flex; align-items: center; gap: 1.4rem; flex-wrap: wrap; margin-top: 1.6rem; }
.network-note { margin: 1.8rem 0 0; padding: 0.75rem 0 0.75rem 0.9rem; border-left: 3px solid var(--warning); max-width: var(--measure); font-size: 0.9rem; color: var(--ink-soft); }
.how-card .how-step { display: block; margin-bottom: 8px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 1.35rem; line-height: 1.2; color: var(--ink); }
.how-card h3 { font-size: 1rem; font-weight: 600; margin: 0 0 0.35rem; }
.how-card p { margin: 0; color: var(--ink-soft); font-size: 0.93rem; }
.hero { padding-top: 0.4rem; }
.how-note { margin: 1rem 0 0; font-size: 0.84rem; color: var(--ink-soft); max-width: var(--measure); }
.home-footer { display: flex; flex-direction: column; gap: 0.35rem; }

/* ── trust footer ─────────────────────────────────────────────────────── */
.footer { margin-top: 2.6rem; padding-top: 1rem; border-top: 1px solid var(--rule); font-size: 0.84rem; color: var(--ink-soft); }
.totals { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; list-style: none; margin: 0.55rem 0 0; padding: 0; font-size: 0.87rem; color: var(--ink-soft); }
.totals--tight { justify-content: flex-end; margin: 0; }

/* ── funding ──────────────────────────────────────────────────────────── */
.funding { margin-top: 26px; }
.funding h2 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.5rem; }
.funding ul { list-style: none; margin: 0; padding: 0; }
.funding li { display: flex; gap: 0.7rem; padding: 0.4rem 0; border-top: 1px solid var(--rule); font-size: 0.9rem; }
.funding li:last-child { border-bottom: 1px solid var(--rule); }
.funding .mark { width: 1rem; flex: none; font-family: var(--font-mono), ui-monospace, monospace; }
.funding-ok .mark { color: var(--ink); }
.funding-short .mark, .funding-short strong:last-child { color: var(--ribbon); }
.funding-unknown .mark { color: var(--warning); }

/* ── wallet picker ────────────────────────────────────────────────────── */
.wallet-list { list-style: none; margin: 1.1rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
.wallet-list button {
  width: 100%; display: flex; align-items: center; gap: 0.75rem;
  padding: 0.7rem 0.85rem; font: inherit; text-align: left; cursor: pointer;
  background: var(--tape-shade); color: var(--ink);
  border: 1px solid var(--control); border-radius: 10px;
}
.wallet-list button:hover { border-color: var(--ink); }
.wallet-list img { border-radius: 6px; }
.wallet-list__blank { width: 26px; height: 26px; border-radius: 6px; background: var(--rule); }

/* ── wallet chip ──────────────────────────────────────────────────────── */
.wallet-wrong-chain { border-color: var(--warning); color: var(--warning); }
/* antd's default Button switches text to colorPrimaryHover on hover and
   keeps it while a Dropdown trigger stays open. The address is the one thing
   this chip exists to show, in every state a pointer or keyboard can put it in. */
.wallet-chip,
.wallet-chip:hover,
.wallet-chip:focus,
.wallet-chip:focus-visible,
.wallet-chip:active { color: var(--ink) !important; }

/* ── stat tiles ───────────────────────────────────────────────────────── */
.stat-tile { background: var(--tape); border: 1px solid var(--rule); border-radius: 8px; padding: 16px 20px; }
.stat-label { margin: 0; color: var(--ink-soft); font-size: 0.85rem; }
.stat-value { margin: 6px 0 2px; font-size: 1.6rem; font-weight: 600; overflow-wrap: anywhere; }
.stat-sub { margin: 0; color: var(--ink-soft); font-size: 0.85rem; }
.stat-value.is-success { color: var(--ink); }
.stat-value.is-warning { color: var(--warning); }
.stat-value.is-danger { color: var(--ribbon); }
.stat-line { display: block; }

/* ── dashboard ────────────────────────────────────────────────────────── */
.coverage-line { margin: 0; color: var(--ink-soft); }
.section-title { margin: 8px 0 12px; font-size: 1rem; font-weight: 600; }

/* ── panels ───────────────────────────────────────────────────────────── */
.panel { background: var(--tape); border: 1px solid var(--rule); border-radius: 8px; padding: 20px; min-width: 0; }
.panel-title { margin: 0 0 12px; font-size: 1rem; font-weight: 600; }
.panel-head, .page-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 4px 12px; flex-wrap: wrap;
  font-size: 0.85rem; color: var(--ink-soft);
}
.panel-head { padding-bottom: 12px; margin-bottom: 4px; border-bottom: 1px solid var(--rule); }
.panel-head strong, .page-head strong { color: var(--ink); font-weight: 600; }
.panel > .verdict:first-child { padding-top: 0; }
.panel > .line:first-child { padding-top: 0.6rem; }
.col > .panel:only-child, .col > .stat-tile:only-child { height: 100%; }
@media (max-width: 639px) { .panel { padding: 16px; } }

/* ── create flow ──────────────────────────────────────────────────────── */
.panel dl.detail, dl.detail.run-summary { grid-template-columns: minmax(6rem, auto) 1fr; }
dl.detail.run-summary dd { overflow-wrap: anywhere; }
```

- [ ] **Step 6: Swap the stylesheets and put every page in the frame**

Delete `frontend/app/globals.css`. In `frontend/app/layout.tsx`, replace `import "./globals.css";` with:

```tsx
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/pages.css";
```

Replace `frontend/components/shell/AppShell.tsx` with:

```tsx
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import BottomTabs from "./BottomTabs";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <SideNav />
      <div className="app-body">
        <TopBar />
        {/* One frame for the title above and the page below (spec §5.2). */}
        <main id="main" className="app-main">
          <div className="frame">{children}</div>
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}
```

In `frontend/components/shell/TopBar.tsx`, replace the returned JSX with:

```tsx
    <header className="top-bar">
      <div className="frame top-bar-inner">
        <h1 className="top-title">{pageTitle(usePathname() ?? "")}</h1>
        <div className="top-actions">
          <NetworkBadge />
          <WalletButton />
          <span className="only-sm"><MoreMenu /></span>
        </div>
      </div>
    </header>
```

In `frontend/components/shell/PublicShell.tsx`, replace the returned JSX with:

```tsx
    <div className="public-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="public-bar">
        <div className="frame public-bar-inner">
          <Brand href={withNet("/", search)} />
          <nav className="public-links" aria-label="Main">
            <Link href={withNet("/why", search)} className="nav-link hide-sm">How it works</Link>
            <NetworkBadge />
            <span className="hide-sm"><ThemeToggle /></span>
            <span className="only-sm"><MoreMenu /></span>
            <Link href={withNet("/dashboard", search)} className="button-primary">Open app</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="public-main">
        <div className="frame">{children}</div>
      </main>
    </div>
```

In `frontend/components/shell/SideNav.tsx`, replace `<p className="nav-group">Learn</p>` with `<p className="nav-group label">Learn</p>`.

In `frontend/components/shell/icons.tsx`, replace `strokeLinecap="round" strokeLinejoin="round"` with `strokeLinecap="square" strokeLinejoin="miter"`.

- [ ] **Step 7: Run the tests, the typecheck and the build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass, including `test/frame.test.ts`, `test/brand.test.ts` and `test/no-legacy-css.test.ts`. The last now reads `app/styles/*.css`, so the forced focus-ring selectors are found in `base.css`.

- [ ] **Step 8: Measure the alignment in a browser**

Restart `pnpm start -p 3055`. With the Playwright MCP, run:

```js
async (page) => {
  const tx = "0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5";
  const routes = ["/", "/why", `/r/${tx}?i=INV-EU-002&n=testnet`, "/dashboard", "/new", "/runs", `/run/${tx}?n=testnet`];
  const bad = [];
  for (const w of [390, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const r of routes) {
      await page.goto("http://localhost:3055" + r, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const head = [...document.querySelectorAll(".public-bar .brand, .top-title")].find(vis);
        const frame = document.querySelector("main .frame");
        const left = frame.getBoundingClientRect().left + parseFloat(getComputedStyle(frame).paddingLeft);
        return {
          head: head ? Math.round(head.getBoundingClientRect().left) : null,
          body: Math.round(left),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      if (m.head === null || m.head !== m.body || m.overflow !== 0) {
        bad.push(`${w} ${r.split("?")[0]} head=${m.head} body=${m.body} overflow=${m.overflow}`);
      }
    }
  }
  return bad.length ? bad.join("\n") : "all aligned, no overflow";
}
```

Expected: `all aligned, no overflow`. Before this task, the same measurement found 64 vs 40 at 1280 on public pages and 256 vs 476 at 1920 on app pages (spec §5.1). Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/app/styles frontend/app/globals.css frontend/app/layout.tsx \
  frontend/components/shell frontend/test/frame.test.ts
git commit -m "feat(web): one frame for header and page, stylesheets by responsibility, the shells on the desk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The tape, the stat tile, the verdict stamp, totals

**Files:**
- Create: `frontend/lib/tape.ts`, `frontend/test/tape.test.ts`
- Create: `frontend/components/ui/Tape.tsx`; Delete: `frontend/components/ui/Panel.tsx`
- Modify: `frontend/components/ui/StatTile.tsx`
- Create: `frontend/components/ui/Totals.tsx`
- Create: `frontend/app/styles/tape.css`; Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/styles/pages.css`: delete the sections `── the ledger line`, `── verdict`, `── the tickmark ladder`, `── stat tiles` and `── panels`; edit `── create flow`
- Modify (rename `Panel` to `Tape`): `app/(app)/new/CreateRun.tsx`, `app/(app)/new/CsvHelp.tsx`, `app/(app)/new/RunSummary.tsx`, `app/(app)/run/[txHash]/Reconciliation.tsx`, `app/(app)/runs/RunHistory.tsx`, `app/(public)/page.tsx`, `app/(public)/r/[txHash]/Receipt.tsx`, `app/(public)/why/Why.tsx`

**Interfaces:**
- Consumes: `.label`, `--tape-pad`, `--edge` (Task 3).
- Produces:
  - `type TapeState = "torn" | "feeding"` and `tapeClass(state?: TapeState, extra?: string): string` in `lib/tape.ts`.
  - `<Tape title?: string head?: ReactNode state?: TapeState className?: string level?: 2 | 3>`.
  - `<Totals lines: string[] total?: string />`.
  - Classes: `.tape`, `.is-feeding`, `.tape-head`, `.tape-title`, `.rule-dashed`, `.leader`, `.leader-key`, `.leader-dots`, `.leader-val`, `.is-void`, `.key-mark`, `.stamp`, `.ladder--printed`, `.slip-amount`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/tape.test.ts`:

```ts
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
    const contents = [...allCss().matchAll(/content:\s*([^;}]+)/g)]
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/tape.test.ts`
Expected: FAIL. `@/lib/tape` cannot be resolved.

- [ ] **Step 3: The class helper and the component**

Create `frontend/lib/tape.ts`:

```ts
/**
 * What a tape's bottom edge says (spec §6.1): "torn" — this is a finished
 * answer; "feeding" — the machine is still printing, or waiting for input.
 */
export type TapeState = "torn" | "feeding";

export function tapeClass(state: TapeState = "torn", extra?: string): string {
  return ["tape", state === "feeding" ? "is-feeding" : "", extra ?? ""].filter(Boolean).join(" ");
}
```

Create `frontend/components/ui/Tape.tsx`:

```tsx
import { useId, type ReactNode } from "react";
import { tapeClass, type TapeState } from "@/lib/tape";

/**
 * One block of a page: paper from the roll (spec §6.1). Ours rather than
 * antd's Card, which renders its title in a div and drops the section out of
 * a screen reader's heading outline.
 */
export default function Tape({
  title, head, state = "torn", className, level = 2, children,
}: {
  title?: string;
  /** The printed header row: a label on the left, meta on the right. */
  head?: ReactNode;
  state?: TapeState;
  className?: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const id = useId();
  const H = level === 3 ? "h3" : "h2";
  return (
    <section className={tapeClass(state, className)} aria-labelledby={title ? id : undefined}>
      {head && <div className="tape-head">{head}</div>}
      {title && <H id={id} className="tape-title">{title}</H>}
      {children}
    </section>
  );
}
```

Delete `frontend/components/ui/Panel.tsx`, then rename every use:

```bash
perl -pi -e 's#import Panel from "\@/components/ui/Panel";#import Tape from "\@/components/ui/Tape";#; s#<Panel\b#<Tape#g; s#</Panel>#</Tape>#g; s#untitled Panel#untitled Tape#g' \
  "app/(app)/new/CreateRun.tsx" "app/(app)/new/CsvHelp.tsx" "app/(app)/new/RunSummary.tsx" \
  "app/(app)/run/[txHash]/Reconciliation.tsx" "app/(app)/runs/RunHistory.tsx" \
  "app/(public)/page.tsx" "app/(public)/r/[txHash]/Receipt.tsx" "app/(public)/why/Why.tsx"
grep -rn "Panel" app components
```

Expected from the `grep`: no output.

- [ ] **Step 4: The stat tile and totals**

Replace `frontend/components/ui/StatTile.tsx` with:

```tsx
import type { ReactNode } from "react";

export type StatTone = "success" | "warning" | "danger";

/**
 * A figure with its label, on a small torn tape. Only exceptions get colour
 * (spec §3.1): "danger" prints in the ribbon, "warning" sits on the
 * highlighter, "success" stays ink. The value's words carry the meaning.
 */
export default function StatTile({
  label, value, tone, sub,
}: { label: string; value: ReactNode; tone?: StatTone; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <div className={tone ? `stat-value is-${tone}` : "stat-value"}><span>{value}</span></div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
```

Create `frontend/components/ui/Totals.tsx`:

```tsx
/**
 * Per-token amounts as an adding machine prints them (spec §6.2): one ◇
 * subtotal line per token — never pooled across tokens — and an optional ✱
 * line that counts rather than sums. `lines` are already formatted amounts,
 * each with its own symbol.
 */
export default function Totals({ lines, total }: { lines: string[]; total?: string }) {
  return (
    <div className="totals-slip">
      <ul className="totals-lines">
        {lines.map((line) => (
          <li key={line} className="leader">
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val">{line}</span>
            <span className="key-mark" aria-hidden="true">◇</span>
          </li>
        ))}
      </ul>
      {total && (
        <p className="leader totals-sum">
          <span className="leader-key">{total}</span>
          <span className="leader-dots" aria-hidden="true" />
          <span className="key-mark" aria-hidden="true">✱</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `app/styles/tape.css`**

```css
/* The tape design system: the tape and what prints on it (spec §6.1–6.3). */

/* ── Tape: every block is paper from the roll ─────────────────────────── */
.tape, .stat-tile, .col > .ant-alert, .ant-modal .ant-modal-container {
  position: relative;
  background: var(--tape);
}
.tape { padding: 16px var(--tape-pad) 18px; min-width: 0; }
/* Torn edges: scallops in the tape's own colour, just outside its box. */
:is(.tape, .stat-tile, .col > .ant-alert, .ant-modal .ant-modal-container)::before,
:is(.tape, .stat-tile, .col > .ant-alert, .ant-modal .ant-modal-container)::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: var(--edge);
  pointer-events: none;
}
:is(.tape, .stat-tile, .col > .ant-alert, .ant-modal .ant-modal-container)::before {
  top: calc(-1 * var(--edge));
  background: radial-gradient(circle at 6px 0, transparent 5px, var(--tape) 5.5px) 0 0 / 12px var(--edge) repeat-x;
}
:is(.tape, .stat-tile, .col > .ant-alert, .ant-modal .ant-modal-container)::after {
  bottom: calc(-1 * var(--edge));
  background: radial-gradient(circle at 6px var(--edge), transparent 5px, var(--tape) 5.5px) 0 0 / 12px var(--edge) repeat-x;
}
/* Feeding: a straight edge and a feed line — still printing, or waiting for you. */
.tape.is-feeding { padding-bottom: 24px; }
.tape.is-feeding::after {
  bottom: 0;
  height: 3px;
  background: repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px);
  opacity: 0.5;
}
@media (prefers-reduced-motion: no-preference) {
  .tape.is-feeding::after { animation: tape-feed 900ms linear infinite; }
}
@keyframes tape-feed { to { background-position: 12px 0; } }
/* A lone block fills its column, so tapes in one row share a height. */
.col > .tape:only-child, .col > .stat-tile:only-child { height: 100%; }

/* ── the printed header ───────────────────────────────────────────────── */
.tape-head, .page-head {
  display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px 12px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft);
}
.tape-head { padding-bottom: 10px; margin-bottom: 14px; border-bottom: 1.5px dashed var(--ink); }
:is(.tape-head, .page-head) strong { color: var(--ink); font-weight: 700; letter-spacing: 0.1em; }
.tape-title {
  margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1.5px dashed var(--ink);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink);
}
.tape-head + .tape-title { border-bottom: 0; padding-bottom: 0; }
.tape > .verdict:first-child { padding-top: 0; }
.rule-dashed { height: 0; border-top: 1.5px dashed var(--ink); margin: 14px 0; }

/* ── key marks: ◇ subtotal, ✱ total, # non-add (spec §6.2) ───────────── */
.key-mark { width: 1.2em; flex: none; text-align: right; font-family: var(--font-mono), ui-monospace, monospace; color: var(--ink-soft); }

/* ── leader lines: LABEL ........ value ───────────────────────────────── */
.leader {
  display: flex; align-items: baseline; gap: 8px; margin: 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 13px; line-height: 1.9;
}
.leader-dots { flex: 1; min-width: 12px; align-self: stretch; border-bottom: 1.5px dotted var(--rule); margin-bottom: 0.55em; }
.leader-key { text-transform: uppercase; letter-spacing: 0.06em; }
.leader-val { text-align: right; min-width: 0; overflow-wrap: anywhere; }
.leader-val.is-void { color: var(--ribbon); }

/* ── Totals: one ◇ line per token ─────────────────────────────────────── */
.totals-lines { list-style: none; margin: 0; padding: 0; }
.totals-sum { border-top: 1.5px dashed var(--ink); margin-top: 4px; padding-top: 2px; font-weight: 600; }

/* ── stat tile: a small torn tape ─────────────────────────────────────── */
.stat-tile { padding: 14px var(--tape-pad) 16px; }
.stat-label {
  margin: 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft);
}
.stat-value {
  margin: 6px 0 2px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 22px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere;
}
.stat-value.is-danger { color: var(--ribbon); }
.stat-value.is-warning > span {
  background: var(--highlight); color: var(--on-highlight); padding: 0 0.2em;
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
}
.stat-sub { margin: 0; font-size: 13px; color: var(--ink-soft); }
.stat-line { display: block; font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; }

/* ── verdict: a heading, or the machine's printed answer ─────────────── */
.verdict { padding: 4px 0 2px; }
.verdict :is(h1, h2) { margin: 0 0 6px; font-size: 22px; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
.verdict p { margin: 0; max-width: var(--measure); color: var(--ink-soft); }
.verdict:is(.ok, .error, .critical, .degraded) { text-align: center; padding: 10px 0 6px; }
.verdict:is(.ok, .error, .critical, .degraded) p { margin-inline: auto; font-size: 14px; }
.stamp, .verdict:is(.ok, .error, .critical, .degraded) :is(h1, h2) {
  margin: 0 0 8px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 100%;
  font-size: 14px; font-weight: 700; line-height: 1.6; letter-spacing: 0.1em; text-transform: uppercase;
  text-align: center;
}
/* The stars are print, not words: empty alt text keeps them out of speech. */
:is(.stamp, .verdict:is(.ok, .error, .critical, .degraded) :is(h1, h2))::before { content: "*** " / ""; }
:is(.stamp, .verdict:is(.ok, .error, .critical, .degraded) :is(h1, h2))::after { content: " ***" / ""; }
.verdict:is(.error, .critical) :is(h1, h2) { color: var(--ribbon); }
.verdict.degraded :is(h1, h2) {
  display: inline; padding: 2px 6px;
  background: var(--highlight); color: var(--on-highlight);
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
}
.verdict.degraded p { margin-top: 12px; }

/* ── the printed checks ───────────────────────────────────────────────── */
.ladder { list-style: none; margin: 0; padding: 0; }
.rung { display: grid; grid-template-columns: minmax(0, 1fr) 1.5em; column-gap: 8px; padding: 4px 0; border-top: 1.5px dotted var(--rule); }
.rung:first-child { border-top: 0; }
.rung .claim { grid-column: 1; grid-row: 1; }
.rung .mark { grid-column: 2; grid-row: 1; text-align: right; font-family: var(--font-mono), ui-monospace, monospace; }
.rung .because { grid-column: 1 / -1; margin: 0 0 4px; }
.rung.fail :is(.mark, .claim) { color: var(--ribbon); }
.rung.skipped :is(.mark, .claim) { color: var(--ink-soft); }
/* On a receipt the checks are printed labels: capitals, a hanging indent,
   the mark kept on the first line. */
.ladder--printed .rung { border-top: 0; padding: 1px 0; }
.ladder--printed .claim {
  padding-left: 1.2em; text-indent: -1.2em;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 13px; line-height: 1.8; letter-spacing: 0.04em; text-transform: uppercase;
}
.ladder--printed .mark { font-size: 13px; line-height: 1.8; }
/* Verification is genuinely sequential, so show it printing — once. */
@media (prefers-reduced-motion: no-preference) {
  .rung { animation: print-in 260ms ease-out both; }
}
@keyframes print-in { from { opacity: 0; transform: translateY(4px); } }

/* ── the ledger line: an amount and what it settles ───────────────────── */
.line {
  display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px 24px;
  padding: 4px 0 16px; margin-bottom: 16px; border-bottom: 1.5px dashed var(--ink);
}
.amount {
  margin: 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 100%;
  font-size: clamp(32px, 6vw, 48px); font-weight: 600; line-height: 1; letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.amount .unit { margin-left: 0.4em; font-size: 15px; font-weight: 500; letter-spacing: 0; }
.amount.is-absent {
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: clamp(20px, 3vw, 26px); font-weight: 700; letter-spacing: -0.01em; color: var(--ink-soft);
}
.slip-amount { text-align: right; margin: 12px 0 4px; }
.payee { margin: 8px 0 0; font-size: 13px; color: var(--ink-soft); }
.reference {
  padding: 2px 8px; border: 1px solid var(--control);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 14px;
}
.reference.is-void { color: var(--ribbon); border-color: var(--ribbon); }
```

In `frontend/app/layout.tsx`, add `import "./styles/tape.css";` directly after the `shell.css` import.

- [ ] **Step 6: Take the rebuilt sections out of `pages.css`**

In `frontend/app/styles/pages.css`, delete the whole sections headed `── the ledger line`, `── verdict`, `── the tickmark ladder`, `── stat tiles` and `── panels`. `tape.css` now owns them; `.page-head` moved with the tape head. Then replace the `── create flow` section with:

```css
/* ── create flow ──────────────────────────────────────────────────────── */
.tape dl.detail, dl.detail.run-summary { grid-template-columns: minmax(6rem, auto) 1fr; }
dl.detail.run-summary dd { overflow-wrap: anywhere; }
```

- [ ] **Step 7: Run the tests, the typecheck and the build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass, including `test/tape.test.ts`.

- [ ] **Step 8: Look at it**

Restart `pnpm start -p 3055`. Screenshot `/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?n=testnet` at 1280×900 with a `theme=light` cookie, then again with `theme=dark`. Expected in both:
- every block is a torn tape;
- the four stat tiles are small tapes;
- `COMPLETE` is ink, not green;
- nothing is clipped.

Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/lib/tape.ts frontend/test/tape.test.ts frontend/components/ui \
  frontend/app/styles frontend/app/layout.tsx "frontend/app/(app)" "frontend/app/(public)"
git commit -m "feat(web): the tape primitive, torn or feeding, with the stamp, leaders and totals it prints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: antd, themed

**Files:**
- Modify: `frontend/lib/theme.ts` (`antdTheme`, final)
- Modify: `frontend/test/theme.test.ts` (new `describe` block)
- Modify: `frontend/components/theme/ThemeProvider.tsx` (the `ConfigProvider` line)
- Create: `frontend/app/styles/antd.css`; Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/styles/pages.css`: delete `── wallet chip`; edit `── wallet picker`
- Modify: `frontend/test/no-legacy-css.test.ts` (two guards)

**Interfaces:**
- Consumes: `palettes` (Task 1); `.tape`, `--tape-pad` (Task 4).
- Produces: square antd components everywhere; Alert glyph icons (`.notice-glyph`, `.is-look`, `.is-bad`); Collapse `▸`/`▾` (`.fold-glyph`).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/test/theme.test.ts`:

```ts
describe("antdTheme cuts paper square and prints in the right faces (spec §6.4)", () => {
  it("has no rounded corners anywhere", () => {
    const t = antdTheme("light").token!;
    for (const k of ["borderRadius", "borderRadiusLG", "borderRadiusSM", "borderRadiusXS", "borderRadiusOuter"] as const) {
      expect(t[k]).toBe(0);
    }
  });
  it("sets sentences in the sans and code in the mono", () => {
    const t = antdTheme("dark").token!;
    expect(t.fontFamily).toBe("var(--font-sans)");
    expect(t.fontFamilyCode).toBe("var(--font-mono)");
  });
  it("hovers the primary button to accentHover, which keeps its text readable", () => {
    expect(antdTheme("light").token!.colorPrimaryHover).toBe(palettes.light.accentHover);
  });
  it("prints Tag statuses by the colour rules", () => {
    const tag = antdTheme("dark").components!.Tag!;
    expect(tag.colorSuccessBg).toBe("transparent");
    expect(tag.colorWarningBg).toBe(palettes.dark.highlight);
    expect(tag.colorWarning).toBe(palettes.dark.onHighlight);
    expect(tag.colorErrorBg).toBe(palettes.dark.ribbonBg);
  });
});
```

In `frontend/test/no-legacy-css.test.ts`, add inside the `describe`:

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run test/theme.test.ts test/no-legacy-css.test.ts`
Expected: FAIL. `borderRadius` is 6. The radius guard lists `10px` and `6px` from the wallet picker. The highlight guard passes; it pins the rule for the CSS added below.

- [ ] **Step 3: The final antd theme**

In `frontend/lib/theme.ts`, replace `antdTheme` with:

```ts
/** antd computes colour in JS; these tokens pin it to the tape system
 *  (spec §6.4). CSS covers the rest, in app/styles/antd.css. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  const popup = `0 1px 0 ${p.rule}, 0 12px 28px -12px rgb(0 0 0 / 0.35)`;
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // Paper is cut square.
      borderRadius: 0, borderRadiusLG: 0, borderRadiusSM: 0, borderRadiusXS: 0, borderRadiusOuter: 0,
      colorPrimary: p.accent,
      colorPrimaryHover: p.accentHover,
      colorPrimaryActive: p.accentHover,
      colorLink: p.ink, colorLinkHover: p.ink, colorLinkActive: p.ink,
      colorInfo: p.ink,
      // Only exceptions get colour: a success is black ink with ✓ and words.
      colorSuccess: p.ink,
      colorWarning: p.warning,
      colorError: p.ribbon,
      colorText: p.ink,
      colorTextHeading: p.ink,
      colorTextSecondary: p.inkSoft,
      colorTextTertiary: p.inkSoft,
      colorTextDescription: p.inkSoft,
      colorTextPlaceholder: p.inkSoft,
      colorTextLightSolid: p.onAccent,
      colorBgBase: p.desk,
      colorBgLayout: p.desk,
      colorBgContainer: p.tape,
      colorBgElevated: p.tape,
      colorBorder: p.control,
      colorBorderSecondary: p.rule,
      colorSuccessBg: p.tapeShade,
      colorWarningBg: p.highlight,
      colorErrorBg: p.ribbonBg,
      colorInfoBg: p.tapeShade,
      fontFamily: "var(--font-sans)",
      fontFamilyCode: "var(--font-mono)",
      fontSize: 15,
      lineHeight: 1.6,
      // Only popups rise off the page.
      boxShadow: popup,
      boxShadowSecondary: popup,
    },
    components: {
      Button: { primaryShadow: "none", defaultShadow: "none", dangerShadow: "none", fontWeight: 600 },
      Table: {
        headerBg: p.tape, headerColor: p.inkSoft, headerSplitColor: "transparent",
        rowHoverBg: p.tapeShade, borderColor: p.rule, footerBg: p.tape,
      },
      Tag: {
        defaultBg: "transparent", defaultColor: p.ink,
        colorSuccess: p.ink, colorSuccessBg: "transparent", colorSuccessBorder: "transparent",
        colorWarning: p.onHighlight, colorWarningBg: p.highlight, colorWarningBorder: p.highlight,
        colorError: p.ribbon, colorErrorBg: p.ribbonBg, colorErrorBorder: p.ribbonBg,
      },
      Alert: {
        colorInfoBg: p.tape, colorSuccessBg: p.tape, colorWarningBg: p.tape, colorErrorBg: p.tape,
        colorInfoBorder: "transparent", colorSuccessBorder: "transparent",
        colorWarningBorder: "transparent", colorErrorBorder: "transparent",
      },
      Steps: { colorTextDescription: p.inkSoft },
      Segmented: { itemSelectedBg: p.accent, itemSelectedColor: p.onAccent, trackBg: "transparent" },
      Input: { activeBorderColor: p.ink, hoverBorderColor: p.ink, activeShadow: `0 0 0 1px ${p.ink}` },
      Modal: { contentBg: p.tape, headerBg: p.tape, footerBg: p.tape },
    },
  };
}
```

- [ ] **Step 4: Alert glyphs and Collapse folds, set once**

In `frontend/components/theme/ThemeProvider.tsx`, replace:

```tsx
      <ConfigProvider theme={antdTheme(mode)}>{children}</ConfigProvider>
```

with:

```tsx
      <ConfigProvider
        theme={antdTheme(mode)}
        // Glyphs in the tape's margin (spec §6.3). Decorative: the alert's
        // title carries the meaning.
        alert={{
          infoIcon: <span className="notice-glyph" aria-hidden="true">i</span>,
          successIcon: <span className="notice-glyph" aria-hidden="true">✓</span>,
          warningIcon: <span className="notice-glyph is-look" aria-hidden="true">!</span>,
          errorIcon: <span className="notice-glyph is-bad" aria-hidden="true">✗</span>,
        }}
        collapse={{
          expandIcon: ({ isActive }) => <span className="fold-glyph" aria-hidden="true">{isActive ? "▾" : "▸"}</span>,
        }}
      >
        {children}
      </ConfigProvider>
```

- [ ] **Step 5: Write `app/styles/antd.css`**

```css
/* The tape design system: what antd's tokens cannot reach (spec §6.4). The
   selectors are checked against antd 6.6.5's own style source. */

/* ── buttons print in mono capitals and press like a key ─────────────── */
.ant-btn {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
}
@media (prefers-reduced-motion: no-preference) {
  .ant-btn:not(:disabled):active { transform: translateY(1px); }
}
/* The wallet chip shows an address: data never changes case (spec §3.6).
   antd switches a Button's text to colorPrimaryHover on hover and keeps it
   while a Dropdown stays open; the address stays ink in every state. */
.wallet-chip { text-transform: none; letter-spacing: 0; }
.wallet-chip,
.wallet-chip:hover,
.wallet-chip:focus,
.wallet-chip:focus-visible,
.wallet-chip:active { color: var(--ink) !important; }
/* On the wrong chain, this button is the one thing to look at. */
.wallet-wrong-chain,
.wallet-wrong-chain:hover,
.wallet-wrong-chain:focus,
.wallet-wrong-chain:active {
  background: var(--highlight) !important;
  color: var(--on-highlight) !important;
  border-color: var(--highlight) !important;
}

/* ── tables print like tape ───────────────────────────────────────────── */
.ant-table-wrapper .ant-table-thead > tr > th {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 10.5px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
  border-bottom: 1.5px solid var(--ink) !important;
}
.ant-table-wrapper .ant-table-tbody > tr > td { border-bottom: 1.5px dotted var(--rule) !important; }
.ant-table-wrapper .ant-table-summary > tr > td { border-top: 1.5px dashed var(--ink); border-bottom: 0 !important; }
/* Inside a tape, a table runs to the tape's edges and its first column sits
   under the tape's title (spec §5.2 rule 4). Specificity (0,5,2) beats
   antd's cell padding (0,4,2) without !important. */
.tape .ant-table-wrapper { margin-inline: calc(-1 * var(--tape-pad)); }
.tape .ant-table-wrapper .ant-table :is(.ant-table-thead, .ant-table-tbody, .ant-table-summary) > tr > :is(th, td):first-child {
  padding-inline-start: var(--tape-pad);
}
.tape .ant-table-wrapper .ant-table :is(.ant-table-thead, .ant-table-tbody, .ant-table-summary) > tr > :is(th, td):last-child {
  padding-inline-end: var(--tape-pad);
}

/* ── tags: only exceptions get colour ─────────────────────────────────── */
.ant-tag {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase;
}
.ant-tag.ant-tag-success { padding-inline: 0; }
.ant-tag.ant-tag-success::before { content: "✓ " / ""; }
.ant-tag.ant-tag-warning::before { content: "! " / ""; }
.ant-tag.ant-tag-error::before { content: "✗ " / ""; }

/* ── alerts: a glyph in the margin, no border ─────────────────────────── */
.ant-alert { border: 0 !important; }
.ant-alert-title { font-weight: 700; }
.notice-glyph {
  display: inline-grid; place-items: center; width: 1.5em; height: 1.5em;
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 13px; font-weight: 700; line-height: 1;
  color: var(--ink);
}
.notice-glyph.is-look { background: var(--highlight); color: var(--on-highlight); }
.notice-glyph.is-bad { color: var(--ribbon); }

/* ── steps: printed labels, the current one marked ────────────────────── */
.ant-steps .ant-steps-item-title {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
}
.ant-steps .ant-steps-item-process .ant-steps-item-title::before { content: "▸ " / ""; }
.ant-steps .ant-steps-item-rail { border-style: dashed !important; }

/* ── the upload slot, where the list feeds in ─────────────────────────── */
.ant-upload-wrapper .ant-upload-drag { background: var(--tape) !important; border: 1.5px dashed var(--control) !important; }
.ant-upload-wrapper .ant-upload-drag:hover { border-color: var(--ink) !important; }

/* ── the theme toggle ─────────────────────────────────────────────────── */
.ant-segmented {
  border: 1px solid var(--control);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
}

/* ── folds ────────────────────────────────────────────────────────────── */
.ant-collapse .ant-collapse-header {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
}
.fold-glyph { font-family: var(--font-mono), ui-monospace, monospace; }

/* ── popups: the only raised surfaces ─────────────────────────────────── */
.ant-modal .ant-modal-container { box-shadow: 0 1px 0 var(--rule), 0 12px 28px -12px rgb(0 0 0 / 0.35); }
.ant-modal .ant-modal-title {
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
```

In `frontend/app/layout.tsx`, add `import "./styles/antd.css";` directly after the `tape.css` import.

- [ ] **Step 6: Tidy `pages.css`**

In `frontend/app/styles/pages.css`, delete the `── wallet chip` section, which `antd.css` now owns. In `── wallet picker`, change `border-radius: 10px;` to nothing (delete the declaration), and delete the two `border-radius: 6px;` declarations on `.wallet-list img` and `.wallet-list__blank`.

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass. A `tsc` error on a `components.Tag` key means antd 6.6.5 does not accept that alias token at component level. None is expected: the names were checked against `antd/es/theme/interface`.

- [ ] **Step 8: Look at it**

Restart `pnpm start -p 3055`. At 1280×900, in both themes:
- **`/new?n=testnet`**: Steps in mono capitals, and the upload slot dashed.
- **`/dashboard?n=testnet`**: primary button is an ink block.
- **`/why?n=testnet`**: tags are ✓ ink, `!` on highlight or `✗` in ribbon; alerts show glyphs and no border.

Tab through the public header: the focus ring is ink and 2px. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/theme.ts frontend/test/theme.test.ts frontend/test/no-legacy-css.test.ts \
  frontend/components/theme/ThemeProvider.tsx frontend/app/styles frontend/app/layout.tsx
git commit -m "feat(web): antd on tape: square, mono labels, glyph alerts, ink tags and a highlighter for the wrong chain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The receipt `/r/[tx]`

**Files:**
- Modify: `frontend/app/(public)/r/[txHash]/Receipt.tsx` (the `Tape` in `Receipt`, the whole `Ready` return)
- Modify: `frontend/app/styles/pages.css`: replace `── trust footer`; add `── receipt`

**Interfaces:**
- Consumes: `Tape`, `.leader*`, `.rule-dashed`, `.slip-amount`, `.ladder--printed`, `Verdict` (Tasks 4–5).
- Produces: `.slip-lines`, `.slip-folds`. `.footer` restyled for the desk.

- [ ] **Step 1: The head, and feeding while it reads**

In `Receipt.tsx`, replace the opening `<Tape head={…}>` of the main component with:

```tsx
        <Tape
          state={phase === "loading" ? "feeding" : "torn"}
          head={
            <>
              <strong>Payment advice</strong>
              <span>
                Arc {net.name}
                {data && (
                  <>
                    {" · "}<span className="sr-only">block </span>
                    <span aria-hidden="true"># </span>{data.blockNumber.toLocaleString("en-US")}
                  </>
                )}
              </span>
            </>
          }
        >
```

- [ ] **Step 2: Print the slip**

In `Ready`, replace everything from `<section className="line">` down to (not including) `<div style={{ marginTop: "2.2rem" }}>` with:

```tsx
      <div className="slip-lines">
        {invoiceId && (
          <p className="leader">
            <span className="leader-key">Invoice</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className={`leader-val${void_ ? " is-void" : ""}`}>
              <span aria-hidden="true"># </span>{invoiceId}
            </span>
          </p>
        )}
        {p && (
          <p className="leader">
            <span className="leader-key">To</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val hex addr" title={p.to}>{short(p.to)}</span>
          </p>
        )}
      </div>

      {p ? (
        <p className="amount slip-amount">
          {decimals === undefined
            ? amountFigure(p.value, p.token, {})
            : (
              <>
                {formatHeadline(p.value, decimals)}
                <span className="unit">{symbol || short(p.token)}</span>
              </>
            )}
        </p>
      ) : (
        /* A bare em dash at headline size reads as a redaction, not an
           absence. Say what is missing instead. */
        <p className="amount is-absent">{absentHeadline(result)}</p>
      )}

      <div className="rule-dashed" aria-hidden="true" />
      <Verdict level={1} tone={copy.tone} title={copy.headline} body={copy.body} />
      <div className="rule-dashed" aria-hidden="true" />

      <ol className="ladder ladder--printed">
        {result.rungs.map((r, i) => (
          <li
            key={r.id}
            className={`rung ${r.status}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="mark" aria-hidden>
              {r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : "–"}
            </span>
            <span className="claim">
              {r.label}
              <span className="sr-only">
                {r.status === "pass" ? " — passed" : r.status === "fail" ? " — failed" : " — not checked"}
              </span>
            </span>
            {r.detail && <span className="because">{r.detail}</span>}
          </li>
        ))}
      </ol>
```

Then replace `<div style={{ marginTop: "2.2rem" }}>` (the wrapper around `Collapse`) with `<div className="slip-folds">`.

- [ ] **Step 3: Receipt and trust-footer styles**

In `frontend/app/styles/pages.css`, replace the `── trust footer` section with:

```css
/* ── trust footer: on the desk, under the tape ────────────────────────── */
.footer { margin-top: 20px; font-size: 13px; color: var(--ink-soft); }
.footer p { max-width: var(--measure); margin: 8px 0 0; }
.totals { display: flex; flex-wrap: wrap; gap: 4px 24px; list-style: none; margin: 8px 0 0; padding: 0; font-size: 13px; color: var(--ink-soft); }
.totals--tight { justify-content: flex-end; margin: 0; }

/* ── receipt: the slip (spec §7.2) ────────────────────────────────────── */
.slip-lines { margin-bottom: 4px; }
.slip-folds { margin-top: 14px; border-top: 1.5px dotted var(--rule); }
.slip-folds .ant-collapse-item { border-bottom: 1.5px dotted var(--rule); }
```

- [ ] **Step 4: Run the tests, the typecheck and the build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass. `plain-language.test.ts` is untouched; the receipt's copy did not change.

- [ ] **Step 5: Check the receipt in a browser**

Restart `pnpm start -p 3055`. Open `/r/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?i=INV-EU-002&n=testnet` at 390×844 and at 1280×900, in both themes. At each, run:

```js
async (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  dataCase: [...document.querySelectorAll(".leader-val, .amount .unit")].map((e) => getComputedStyle(e).textTransform),
  stars: getComputedStyle(document.querySelector(".verdict h1"), "::before").content,
}))
```

Expected:
- `overflow` is 0 at both widths;
- every `dataCase` entry is `"none"`;
- `stars` is `"*** " / ""` (Chromium reports the alt-text form).

This link has no payment amount to show, so stress the narrow slip directly. At 390×844 run:

```js
async (page) => page.evaluate(() => {
  const tape = document.querySelector(".tape");
  const amount = document.createElement("p");
  amount.className = "amount slip-amount";
  amount.innerHTML = '123,456,789.12345678<span class="unit">cirBTC</span>';
  tape.querySelector(".slip-lines").after(amount);
  const claim = tape.querySelector(".ladder--printed .claim");
  if (claim) claim.firstChild.textContent = "The payment is on the payer's recorded list and it is long";
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    amountFits: amount.scrollWidth <= tape.clientWidth,
    unit: amount.querySelector(".unit").textContent,
  };
})
```

Expected: `overflow` 0, `amountFits` true, `unit` `"cirBTC"`. The injected nodes vanish on reload.

Screenshot both widths. Expected on screen: the invoice as a leader line, the verdict as a stamp between two dashed rules, and the five checks in capitals with their marks at the right. This link has no salt, so it reads "This link is incomplete". Task 12 checks a Verified receipt from a fresh run.

Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(public)/r/[txHash]/Receipt.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): the receipt as a printed slip: leaders, the amount, a stamp, the checks in print

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The home page, its proof, and the end-of-roll footer

**Files:**
- Create: `frontend/lib/mainnet-proof.ts`, `frontend/test/mainnet-proof.test.ts`
- Create: `frontend/lib/site-footer.ts`, `frontend/test/site-footer.test.ts`
- Create: `frontend/components/ui/SiteFooter.tsx`
- Replace: `frontend/app/(public)/page.tsx`
- Modify: `frontend/app/styles/pages.css`: replace `── home`; add `── site footer`

**Interfaces:**
- Consumes: `Tape`, `Mark`, `.leader*`, `.stamp`, `.hl`, `.label`, `.key-mark` (Tasks 2–5).
- Produces:
  - `MAINNET_PROOF` (typed `as const`).
  - `contractLine(net: Pick<NetworkView, "anchor" | "explorer">): { short: string; href: string } | undefined`.
  - `<SiteFooter net: NetworkView />`, a client component. Task 11 reuses it on `/why`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/mainnet-proof.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyReceipt } from "@ledgerline/core";
import { MAINNET_PROOF as P } from "@/lib/mainnet-proof";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const NOTE = read("../../docs/notes/2026-09-24-mainnet-proof.md");
const README = read("../../README.md");

describe("the home page's proof is what was measured (spec §7.1)", () => {
  it("names the transaction the note and the README name", () => {
    expect(NOTE).toContain(P.txHash);
    expect(README).toContain(P.txHash);
  });

  it("prints the block, the gas, the price and the payments the note measured", () => {
    expect(NOTE).toContain(P.block.toLocaleString("en-US"));
    expect(NOTE).toContain(P.gasUsed.toLocaleString("en-US"));
    expect(NOTE).toContain(`${P.gasPriceGwei} Gwei`);
    for (const payment of P.payments) expect(NOTE).toContain(payment);
  });

  it("rounds the measured fee, 0.00559 USDC, and no further", () => {
    expect(NOTE).toContain("0.00559");
    expect(Number(P.feeUsdc)).toBeCloseTo(0.00559, 4);
  });

  it("counts the receipt's checks from the verifier itself", () => {
    const r = verifyReceipt({ invoiceId: "", runSalt: undefined, receiptStatus: "success", logs: [] });
    expect(r.rungs).toHaveLength(P.checksPerReceipt);
  });
});
```

Create `frontend/test/site-footer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contractLine } from "@/lib/site-footer";

describe("contractLine", () => {
  it("names the contract by its short address and links its explorer page", () => {
    expect(contractLine({ anchor: "0xd4838881EcBa8320d456B8B65A07A0ac167F0890", explorer: "https://explorer.arc.io" }))
      .toEqual({
        short: "0xd483…0890",
        href: "https://explorer.arc.io/address/0xd4838881EcBa8320d456B8B65A07A0ac167F0890",
      });
  });
  it("says nothing when this deployment has no contract configured", () => {
    expect(contractLine({ anchor: undefined, explorer: "https://explorer.arc.io" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run test/mainnet-proof.test.ts test/site-footer.test.ts`
Expected: FAIL. Neither `@/lib/mainnet-proof` nor `@/lib/site-footer` resolves.

- [ ] **Step 3: The two modules**

Create `frontend/lib/mainnet-proof.ts`:

```ts
/**
 * The mainnet proof, measured on 2026-09-24 and recorded in
 * docs/notes/2026-09-24-mainnet-proof.md. Facts about one transaction, shown
 * on the home page with a link to check each one. test/mainnet-proof.test.ts
 * keeps this in step with the note, the README and the verifier.
 */
export const MAINNET_PROOF = {
  txHash: "0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0",
  block: 22_453_870,
  date: "2026-09-24",
  payments: ["0.10 USDC", "0.10 EURC", "0.00001 cirBTC"],
  checksPerReceipt: 5,
  /** 0.00559 USDC, rounded for display. */
  feeUsdc: "0.0056",
  gasUsed: 266_370,
  gasPriceGwei: 21,
  /** The same payment through the standard Multicall3: 0 of 1 referenced. */
  control: { referenced: 0, payments: 1 },
} as const;
```

Create `frontend/lib/site-footer.ts`:

```ts
import { short, type NetworkView } from "@/lib/chain";

/**
 * The recorded-lists contract for the footer's last line: its short address
 * and explorer page, or nothing when this deployment has none configured
 * (it comes from an env variable).
 */
export function contractLine(
  net: Pick<NetworkView, "anchor" | "explorer">,
): { short: string; href: string } | undefined {
  if (!net.anchor) return undefined;
  return { short: short(net.anchor), href: `${net.explorer}/address/${net.anchor}` };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm vitest run test/mainnet-proof.test.ts test/site-footer.test.ts`
Expected: PASS.

- [ ] **Step 5: The footer**

Create `frontend/components/ui/SiteFooter.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import Mark from "@/components/ui/Mark";
import Tape from "@/components/ui/Tape";
import { contractLine } from "@/lib/site-footer";
import type { NetworkView } from "@/lib/chain";

const RECONCILE = "pnpm reconcile <tx>";

/**
 * The last tape on / and /why (spec §7.4): how to check a run without us,
 * where to read more, and the promises the recorded-lists contract keeps.
 * Not on /r — a recipient needs only their receipt.
 */
export default function SiteFooter({ net }: { net: NetworkView }) {
  const [copied, setCopied] = useState(false);
  const contract = contractLine(net);

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    const code = e.currentTarget.parentElement?.querySelector("code");
    try {
      await navigator.clipboard.writeText(RECONCILE);
      setCopied(true);
    } catch {
      // Some browsers refuse the clipboard: select the command to copy by hand.
      if (code) window.getSelection()?.selectAllChildren(code);
    }
  };

  return (
    <footer className="site-footer">
      <Tape
        head={
          <>
            <strong className="brand-inline"><Mark size={11} /> Ledgerline</strong>
            <span>Arc {net.name} · chain {net.chain.id}</span>
          </>
        }
      >
        <div className="site-footer-cols">
          <section>
            <h2 className="label site-footer-h">Check it without us</h2>
            <div className="command">
              <code>{RECONCILE}</code>
              <button type="button" className="command-copy" onClick={(e) => void copy(e)}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="because">
              Rebuilds any run&apos;s table from the chain alone. Receipts do the same in the
              recipient&apos;s own browser.
            </p>
          </section>
          <section>
            <h2 className="label site-footer-h">Read more</h2>
            <ul className="site-footer-links">
              <li><Link href={`/why?n=${net.name}`}>How this differs from an ordinary batch</Link></li>
              <li><a href="https://github.com/hms1499/ledgerline" target="_blank" rel="noreferrer">Source code</a></li>
              {contract && (
                <li><a href={contract.href} target="_blank" rel="noreferrer">The recorded-lists contract ↗</a></li>
              )}
            </ul>
          </section>
        </div>
        <div className="site-footer-end">
          {contract && <span><span aria-hidden="true"># </span>Recorded lists {contract.short}</span>}
          <span>Never holds funds · no admin · no upgrades</span>
        </div>
        <p className="site-footer-fin" aria-hidden="true">✱ ✱ ✱</p>
      </Tape>
    </footer>
  );
}
```

The spec's end line reads `· verified source`. That is dropped here: the address comes from an env variable, and only the mainnet deploy's verification was measured. The explorer link lets anyone see the verification status for themselves.

- [ ] **Step 6: The page**

Replace `frontend/app/(public)/page.tsx` with:

```tsx
import Link from "next/link";
import { defaultNetwork } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { MAINNET_PROOF as P } from "@/lib/mainnet-proof";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import SiteFooter from "@/components/ui/SiteFooter";

const PAYS_IN = [
  { symbol: "USDC", decimals: 6 },
  { symbol: "EURC", decimals: 6 },
  { symbol: "cirBTC", decimals: 8 },
] as const;

const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

export default function Home() {
  const net = defaultNetwork();
  const testnet = net.name === "testnet";

  return (
    <Grid>
      <Col span={8} md={12}>
        <p className="label">Batched stablecoin payouts on Arc</p>
        <h1 className="display">A payment that carries its own invoice</h1>
        <p className="lede">
          Pay a list of invoices in one transaction. Each payment records which invoice it
          settles, on chain, so you and the people you pay can each check it without a shared
          spreadsheet — or trusting us.
        </p>
        <div className="home-actions">
          <Link href="/new" className="button-primary">Create a payout run</Link>
          <Link href="/dashboard">Open your dashboard</Link>
        </div>
        <p className="pays-in">
          <span className="label">Pays in</span>
          {PAYS_IN.map((t) => (
            <span key={t.symbol} className="chip">
              {t.symbol} <span className="chip-soft">{t.decimals} dp</span>
            </span>
          ))}
        </p>
        {testnet ? (
          <p className="home-note">
            <span className="hl home-note-mark" aria-hidden="true">!</span>
            This is Arc testnet: tokens here have no value, so nothing you do can lose real
            money. Get test USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>
            {" "}— you need a little USDC for network fees even when paying other tokens.
          </p>
        ) : (
          <p className="home-note">
            <span className="hl home-note-mark" aria-hidden="true">!</span>
            This is Arc mainnet: a run moves real money.{" "}
            <Link href="/new?n=testnet">Try it on testnet first</Link>.
          </p>
        )}
      </Col>

      <Col span={4} md={12}>
        {/* Labelled so it is never read as someone's real payment. */}
        <Tape head={<><strong>Payment advice</strong><span className="hl">Example</span></>}>
          <p className="leader">
            <span className="leader-key">Invoice</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val"><span aria-hidden="true"># </span>INV-US-001</span>
          </p>
          <p className="leader">
            <span className="leader-key">To</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val hex addr">0xe48A…732a</span>
          </p>
          <p className="amount slip-amount">0.10<span className="unit">USDC</span></p>
          <div className="rule-dashed" aria-hidden="true" />
          <p className="leader">
            <span className="leader-key">Five checks against the chain</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val">✓</span>
          </p>
          <p className="stamp">Verified</p>
        </Tape>
        <p className="label example-caption">What a recipient sees</p>
      </Col>

      <Col span={12}>
        <Tape
          head={
            <>
              <strong>Proof · Arc mainnet</strong>
              <span>
                <span className="sr-only">block </span><span aria-hidden="true"># </span>
                {P.block.toLocaleString("en-US")} · {P.date}
              </span>
            </>
          }
        >
          <dl className="proof">
            <div>
              <dt>Tokens, one transaction</dt>
              <dd className="proof-fig">3<span className="key-mark" aria-hidden="true">◇</span></dd>
              <dd className="because">{P.payments.join(" · ")}, each carrying its invoice.</dd>
            </div>
            <div>
              <dt>Checks on every receipt</dt>
              <dd className="proof-fig">{P.checksPerReceipt}<span className="key-mark" aria-hidden="true">✓</span></dd>
              <dd className="because">Run in the recipient&apos;s own browser, against the chain. No account, and nothing from us.</dd>
            </div>
            <div>
              <dt>USDC in fees, all three</dt>
              <dd className="proof-fig">{P.feeUsdc}</dd>
              <dd className="because">{P.gasUsed.toLocaleString("en-US")} gas at {P.gasPriceGwei} Gwei, measured on the run itself.</dd>
            </div>
            <div>
              <dt>Referenced by a plain batch</dt>
              <dd className="proof-fig">{P.control.referenced}<span className="proof-of"> / {P.control.payments}</span></dd>
              <dd className="because">The same payment through the standard Multicall3, same day, as a control.</dd>
            </div>
          </dl>
          <div className="proof-foot">
            <span className="hex">
              <span aria-hidden="true"># </span>{shortHash(P.txHash)} <span aria-hidden="true">✱</span>
            </span>
            <span className="proof-links">
              <a href={`https://explorer.arc.io/tx/${P.txHash}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
              <Link href={`/run/${P.txHash}?n=mainnet`}>Open the run here</Link>
              <Link href="/why?n=mainnet">Compare with the control</Link>
            </span>
          </div>
        </Tape>
      </Col>

      <Col span={12}>
        <Tape head={<><strong>How a run works</strong><span>3 steps · one transaction</span></>}>
          <ol className="how">
            <li>
              <span className="label">1 · Upload</span>
              <h3>Upload a list of invoices</h3>
              <p className="because">
                A CSV with one line per payment: invoice, token, recipient, amount.{" "}
                <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download a sample</a>{" "}
                to start from. It stays in your browser.
              </p>
            </li>
            <li>
              <span className="label">2 · Check, then pay</span>
              <h3>Check it, then pay in one transaction</h3>
              <p className="because">
                Every payment is tried against the chain before you pay, so a short balance or
                a transfer the token would refuse shows up before any money moves. Then one
                transaction pays every line.
              </p>
            </li>
            <li>
              <span className="label">3 · Send receipts</span>
              <h3>Send each recipient their receipt link</h3>
              <p className="because">
                The link shows what was paid and which invoice it settles, checked against the
                chain in their own browser. They need no account and nothing from us.
              </p>
            </li>
          </ol>
        </Tape>
      </Col>

      <Col span={12}>
        <SiteFooter net={net} />
      </Col>
    </Grid>
  );
}
```

- [ ] **Step 7: Home and footer styles**

In `frontend/app/styles/pages.css`, replace the `── home` section with:

```css
/* ── home (spec §7.1) ─────────────────────────────────────────────────── */
.display { margin: 8px 0 16px; font-size: clamp(32px, 4.4vw, 48px); line-height: 1.06; font-weight: 700; letter-spacing: -0.018em; text-wrap: balance; }
.lede { margin: 0; font-size: 17px; max-width: 54ch; }
.home-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; margin-top: 24px; }
.pays-in { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 24px 0 0; }
.pays-in .label { margin-right: 4px; }
.chip {
  padding: 3px 8px; border: 1px solid var(--control); background: var(--tape);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 12px;
}
.chip-soft { color: var(--ink-soft); }
.home-note { margin: 14px 0 0; font-size: 14px; max-width: var(--measure); }
.home-note-mark { margin-right: 6px; padding: 0 6px; font-family: var(--font-mono), ui-monospace, monospace; font-weight: 700; }
.example-caption { margin: 14px 0 0; text-align: center; }

/* The proof: four measured figures, each linked to its evidence. */
.proof { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; }
.proof > div { display: flex; flex-direction: column; min-width: 0; padding: 2px var(--tape-pad) 4px; }
.proof > div:first-child { padding-left: 0; }
.proof > div + div { border-left: 1.5px dotted var(--rule); }
.proof dt {
  order: 2; margin: 8px 0 4px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
}
.proof-fig {
  order: 1; margin: 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 100%;
  font-size: 34px; font-weight: 600; line-height: 1.05; letter-spacing: -0.03em;
}
.proof-fig .key-mark, .proof-of { margin-left: 8px; font-size: 18px; font-weight: 500; color: var(--ink-soft); }
.proof dd.because { order: 3; margin: 0; }
.proof-foot {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px 16px;
  margin-top: 16px; padding-top: 10px; border-top: 1.5px dashed var(--ink); font-size: 13px;
}
.proof-links { display: flex; flex-wrap: wrap; gap: 8px 18px; }

.how { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.how > li { min-width: 0; padding: 0 var(--tape-pad); }
.how > li:first-child { padding-left: 0; }
.how > li + li { border-left: 1.5px dotted var(--rule); }
.how h3 { margin: 6px 0; font-size: 17px; line-height: 1.3; }

@media (max-width: 1023px) {
  .proof { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 16px; }
  .proof > div:nth-child(3) { padding-left: 0; border-left: 0; }
  .how { grid-template-columns: minmax(0, 1fr); row-gap: 16px; }
  .how > li { padding-left: 0; border-left: 0 !important; }
}
@media (max-width: 639px) {
  .proof { grid-template-columns: minmax(0, 1fr); }
  .proof > div { padding-left: 0; border-left: 0 !important; }
}

/* ── site footer: the end of the roll (spec §7.4) ─────────────────────── */
.brand-inline { display: inline-flex; align-items: center; gap: 6px; }
.site-footer-cols { display: grid; grid-template-columns: 2fr 1fr; }
.site-footer-cols > section { min-width: 0; padding: 0 var(--tape-pad); }
.site-footer-cols > section:first-child { padding-left: 0; }
.site-footer-cols > section + section { border-left: 1.5px dotted var(--rule); }
.site-footer-h { margin: 0 0 8px; color: var(--ink); font-weight: 600; }
.command { display: flex; justify-content: space-between; align-items: center; gap: 8px; max-width: 420px; padding: 6px 10px; background: var(--tape-shade); }
.command code { font-size: 13px; }
.command-copy {
  padding: 2px 6px; background: none; border: 1px solid var(--control); color: var(--ink); cursor: pointer;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
}
.site-footer-links { list-style: none; margin: 0; padding: 0; font-size: 14px; }
.site-footer-links li { padding: 3px 0; }
.site-footer-end {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px;
  margin-top: 18px; padding-top: 10px; border-top: 1.5px dashed var(--ink);
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 11.5px; color: var(--ink-soft);
}
.site-footer-fin { margin: 14px 0 0; text-align: center; font-family: var(--font-mono), ui-monospace, monospace; font-weight: 700; letter-spacing: 0.14em; }
@media (max-width: 639px) {
  .site-footer-cols { grid-template-columns: minmax(0, 1fr); row-gap: 16px; }
  .site-footer-cols > section { padding-left: 0; border-left: 0 !important; }
}
```

- [ ] **Step 8: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 9: Look at it**

Restart `pnpm start -p 3055`. Screenshot `/` at 1280×900 and at 390×844, in both themes, full page. Expected:
- the hero on the left with the Pays in chips and the mainnet line, the example slip on the right;
- the proof tape with four columns (one column at 390);
- how it works as one tape;
- the footer tape ending in `✱ ✱ ✱`.

Click **Copy** in the footer: it reads **Copied**. Tab to it: the ink ring shows. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/mainnet-proof.ts frontend/lib/site-footer.ts frontend/test/mainnet-proof.test.ts \
  frontend/test/site-footer.test.ts frontend/components/ui/SiteFooter.tsx "frontend/app/(public)/page.tsx" \
  frontend/app/styles/pages.css
git commit -m "feat(web): a home page that shows its proof: the measured mainnet run, and an end-of-roll footer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The run page `/run/[tx]`

**Files:**
- Modify: `frontend/app/(app)/run/[txHash]/Reconciliation.tsx` (the loading `Col`, the stats `map`)

**Interfaces:**
- Consumes: `Tape` (with `state`), `StatTile`, `Totals` (Task 4). `runStatsView(...)` already gives `s.sub: string[]` of formatted per-token amounts for `s.key === "payments"`.

- [ ] **Step 1: Feeding while it reads**

Replace:

```tsx
          <Col span={12}><Tape><Skeleton active paragraph={{ rows: 8 }} /></Tape></Col>
```

with:

```tsx
          <Col span={12}><Tape state="feeding"><Skeleton active paragraph={{ rows: 8 }} /></Tape></Col>
```

- [ ] **Step 2: Payments as ◇ lines**

Add `import Totals from "@/components/ui/Totals";` beside the other `@/components/ui` imports. In the `stats.map`, replace the `sub={…}` expression with:

```tsx
            sub={s.key === "recorded"
              ? <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View on explorer</a>
              : s.key === "payments" && s.sub.length
                ? <Totals lines={s.sub} />
                : s.sub.length ? s.sub.map((line) => <span key={line} className="stat-line">{line}</span>) : undefined}
```

- [ ] **Step 3: Run the checks**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 4: Look at it**

Restart `pnpm start -p 3055`. Screenshot `/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?n=testnet` at 1280×900 and 390×844, in both themes. Expected:
- the Payments tile shows `0.1 USDC ◇` and `0.1 EURC ◇` on dotted leaders;
- the table's first column sits directly under the tape's title;
- the table footer has a dashed rule.

Run this at 1280:

```js
async (page) => page.evaluate(() => {
  const tape = document.querySelector(".tape .ant-table-wrapper").closest(".tape");
  const title = tape.querySelector(".tape-title").getBoundingClientRect().left;
  const cell = tape.querySelector(".ant-table-thead th:not(.ant-table-row-expand-icon-cell)");
  const pad = parseFloat(getComputedStyle(cell).paddingLeft);
  return { title: Math.round(title), firstText: Math.round(cell.getBoundingClientRect().left + pad) };
})
```

Expected: `title` and `firstText` are within 1px when the first header cell is a text column. If the expand-icon column comes first, check the next header cell instead: its text starts at `title` plus the icon column's width. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/run/[txHash]/Reconciliation.tsx"
git commit -m "feat(web): the run page on tape: feeding while it reads, payments as subtotal lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The create flow `/new`

**Files:**
- Modify: `frontend/app/(app)/new/CreateRun.tsx` (the step `Tape`)
- Modify: `frontend/app/(app)/new/RunSummary.tsx`
- Modify: `frontend/app/styles/pages.css`: replace `── funding`

**Interfaces:**
- Consumes: `Tape` with `state`, `Totals` (Task 4). `runSummaryView(...).toPay: string[]`.

- [ ] **Step 1: Feeding until the receipt**

In `CreateRun.tsx`, replace:

```tsx
        <Tape title={step === 1 ? "Payments in this run" : undefined}>
```

with:

```tsx
        {/* The whole flow is a tape still feeding; the Result tears it off (spec §6.1). */}
        <Tape state={step === 4 ? "torn" : "feeding"} title={step === 1 ? "Payments in this run" : undefined}>
```

- [ ] **Step 2: The summary as totals**

In `RunSummary.tsx`, add `import Totals from "@/components/ui/Totals";` and replace:

```tsx
        <dd>{view.toPay.map((t) => <span key={t} className="hex stat-line">{t}</span>)}</dd>
```

with:

```tsx
        <dd><Totals lines={view.toPay} /></dd>
```

- [ ] **Step 3: The funding check as a printed list**

In `frontend/app/styles/pages.css`, replace the `── funding` section with:

```css
/* ── funding: can this wallet pay it? ─────────────────────────────────── */
.funding { margin-top: 24px; }
.funding h2 {
  margin: 0 0 8px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.funding ul { list-style: none; margin: 0; padding: 0; }
.funding li { display: flex; gap: 10px; padding: 5px 0; border-top: 1.5px dotted var(--rule); font-size: 14px; }
.funding li:last-child { border-bottom: 1.5px dotted var(--rule); }
.funding .mark { width: 1.2rem; flex: none; text-align: center; font-family: var(--font-mono), ui-monospace, monospace; }
.funding-short .mark, .funding-short strong:last-child { color: var(--ribbon); }
.funding-unknown .mark { background: var(--highlight); color: var(--on-highlight); }
```

- [ ] **Step 4: Run the checks**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 5: Look at it**

Restart `pnpm start -p 3055`. Open `/new?n=testnet` at 1280×900. Upload the sample: save `SAMPLE_CSV` from `lib/sample-csv.ts` to a file in the scratchpad and set it on the file input. On the Review step, expected:
- the step bar shows mono capitals with `▸` on the current step;
- the work tape has a straight, feeding bottom edge;
- the sticky summary on the right shows `To pay` as ◇ lines.

At 390×844 the summary comes first. Screenshot both themes. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(app)/new/CreateRun.tsx" "frontend/app/(app)/new/RunSummary.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): the create flow feeds until the receipt tears it off; the summary prints totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The dashboard and run history

**Files:**
- Modify: `frontend/app/(app)/dashboard/Dashboard.tsx` (the two empty states; the recent-runs block)
- Modify: `frontend/app/styles/pages.css`: `── dashboard`

**Interfaces:**
- Consumes: `Tape` (Task 4).

- [ ] **Step 1: Empty states on tape, in the Ledger pattern**

In `Dashboard.tsx`, add `import Tape from "@/components/ui/Tape";`. In the `!wallet` branch, replace the `<Col span={8} md={12}>` element and its contents with:

```tsx
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Your payouts at a glance</h2>
              <p>
                Connect the wallet that paid them. This overview is built from runs sent from
                this browser and re-read from the chain.
              </p>
            </section>
            <Button type="primary" style={{ marginTop: 20 }} onClick={connect}>Connect a wallet</Button>
          </Tape>
        </Col>
```

In the `records.length === 0` branch, replace the `<Col span={12}>` element and its contents with:

```tsx
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Nothing sent from this browser yet</h2>
              <p>
                A run sent from another browser is still on chain. Open it from the explorer or by
                its transaction hash.
              </p>
            </section>
            <p style={{ marginTop: 20, marginBottom: 0 }}>
              <Link href={withNet("/new", search)} className="button-primary">Create a payout run</Link>
            </p>
          </Tape>
        </Col>
```

- [ ] **Step 2: Recent runs on a tape**

Replace:

```tsx
      <Col span={12}>
        <h2 className="section-title">Recent runs</h2>
        <Table<RunRecord>
```

with:

```tsx
      <Col span={12}>
        <Tape title="Recent runs">
        <Table<RunRecord>
```

and close it after the "All runs" paragraph, so the block ends:

```tsx
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <Link href={withNet("/runs", search)}>All runs →</Link>
        </p>
        </Tape>
      </Col>
```

- [ ] **Step 3: Retire the unused heading class**

Run: `grep -rn "section-title" app components`
Expected: no output. Delete the `.section-title` rule from the `── dashboard` section of `pages.css`.

- [ ] **Step 4: Run the checks**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 5: Look at it**

Restart `pnpm start -p 3055`. Screenshot `/dashboard?n=testnet` and `/runs?n=testnet` at 1280×900 and 390×844, in both themes, with no wallet connected. Expected: each empty state is a torn tape spanning the frame. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(app)/dashboard/Dashboard.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): the dashboard on tape, its empty states and recent runs in the ledger pattern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `/why`, and retiring the last part-1 rules

**Files:**
- Modify: `frontend/app/(public)/why/Why.tsx` (the loading `Col`; the site footer)
- Modify: `frontend/app/styles/pages.css` (delete what no page uses)

**Interfaces:**
- Consumes: `Tape` with `state` (Task 4), `SiteFooter` (Task 7).

- [ ] **Step 1: Feeding while it reads, then the footer**

In `Why.tsx`, add `import SiteFooter from "@/components/ui/SiteFooter";`. Replace:

```tsx
      {phase === "loading" && <Col span={12}><Tape><Skeleton active paragraph={{ rows: 8 }} /></Tape></Col>}
```

with:

```tsx
      {phase === "loading" && <Col span={12}><Tape state="feeding"><Skeleton active paragraph={{ rows: 8 }} /></Tape></Col>}
```

Directly after the `<Col span={12}>` that holds `<footer className="footer">`, add:

```tsx
      <Col span={12}>
        <SiteFooter net={net} />
      </Col>
```

- [ ] **Step 2: Delete rules no page uses any more**

Run:

```bash
for c in how-card how-step how-note home-footer network-note hero; do
  printf "%s: " "$c"; grep -rln "\"$c\"\|'$c'\|$c\b" app components --include=*.tsx | wc -l
done
```

Expected: `0` for every class. Delete these rules from `pages.css`: `.how-card …`, `.how-step`, `.how-note`, `.home-footer`, `.network-note` and `.hero`. Most went with Task 7's replacement of `── home`. Delete any that remain.

- [ ] **Step 3: Run the checks**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 4: Look at it**

Restart `pnpm start -p 3055`. Screenshot `/why?n=testnet` at 1280×900 and 390×844, in both themes. Expected:
- the comparison tape;
- the two transactions side by side at 1280 and stacked at 390;
- the standalone "What this comparison does not claim" alert as a torn tape;
- the site footer last.

Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(public)/why/Why.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): /why on tape with the end-of-roll footer; retire the part-1 home rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The verification pass

**Files:** none, unless a check fails. A fix goes in its owning file, with its own commit.

- [ ] **Step 1: Unit checks, typecheck, build**

Run from the repo root: `pnpm test && pnpm typecheck && pnpm build`
Expected: every package passes; `next build` prints the route table with no errors.

- [ ] **Step 2: No flash, light by default**

Restart `pnpm start -p 3055` in `frontend/`. Run:

```bash
curl -s http://localhost:3055/ | grep -o 'data-theme="[a-z]*"' | head -1
curl -s -H 'Cookie: theme=dark' http://localhost:3055/ | grep -o 'data-theme="[a-z]*"' | head -1
```

Expected: `data-theme="light"`, then `data-theme="dark"`.

In Playwright, emulate `colorScheme: "dark"` with no cookies and open `/`. Take a screenshot as soon as the page loads. Expected: dark desk, dark tape, readable ink, and the highlighter's text still dark on yellow.

- [ ] **Step 3: Alignment and overflow, every route, every width**

Re-run the Task 3 Step 8 measurement.
Expected: `all aligned, no overflow`.

- [ ] **Step 4: axe, both themes**

For `theme=light` and `theme=dark` (set as a cookie on `localhost`), visit:
- `/`, `/dashboard`, `/new`, `/runs` and `/why`;
- `/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?n=testnet`;
- `/r/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?i=INV-EU-002&n=testnet`.

On each page:
- Inject axe with `page.addScriptTag({ path: ".playwright-mcp/axe.min.js" })`. If the file is missing, download it from `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js`.
- Run `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })`.

Expected: no `serious` or `critical` violations. Fix any in its owning file, re-run, and commit the fix separately.

- [ ] **Step 5: Data keeps its case**

On `/run/…?n=testnet` at 1280, run:

```js
async (page) => page.evaluate(() =>
  [...document.querySelectorAll(".leader-val, .hex, .wallet-chip, .amount .unit")]
    .map((e) => getComputedStyle(e).textTransform)
    .filter((t) => t !== "none"))
```

Expected: `[]`.

- [ ] **Step 6: Keyboard**

At 1280, 800 and 390 wide, tab through:
- the sidebar (1280, 800);
- the bottom tabs (390);
- the ⋯ menu (390);
- the wallet menu (after the run below connects a wallet);
- the footer's Copy button on `/`.

Expected: every stop shows the 2px ink ring.

- [ ] **Step 7: The money flow, unchanged**

Run a local signer holding `PRIVATE_KEY` from the repo `.env`, in its own Node process. It answers only `eth_requestAccounts`, `eth_accounts`, `personal_sign` and `eth_sendTransaction`, with `Access-Control-Allow-Origin: http://localhost:3055` (never `*`: any open site could otherwise ask it to sign).

In the Playwright page, inject an EIP-6963 provider. It forwards those four methods to the signer, answers `eth_chainId` with testnet (`0x4cef52`, chain 5042002), and sends every other request to `https://rpc.testnet.arc.io`.

Then:
1. Open `/new?n=testnet` and name the run `tape-check <ISO time>`.
2. Upload the two-line sample: 0.1 USDC and 0.1 EURC to `0xe48A096B9E74f064b13c17734af29F85E02d732a`.
3. Connect wallet from the top bar, then click through Check, Sign and check, Sign and send, and Sign and pay.
4. While the payment is sending, open the wallet menu: **Disconnect** is disabled.
5. On the Result, the tape is torn. Open one receipt link in a fresh browser context with no provider injected.

Expected: the receipt reads **Verified**, with every check ✓ (5/5). The stamp reads `*** VERIFIED ***` and the amount prints in Martian at full width. Screenshot it at 390 and 1280, in both themes.

- [ ] **Step 8: Clean up and report**

Stop the signer and `next start`. Empty `.playwright-mcp/` except `axe.min.js`. Run `git status`: nothing is uncommitted except the fixes already committed. Report every check above with its actual output.
