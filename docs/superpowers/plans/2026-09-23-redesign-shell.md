# Redesign Part 1 — Design System and App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every Ledgerline route inside a dark-by-default, WCAG-AA "Settlement blue" shell — App shell (sidebar, wallet, bottom tabs) for payer routes and Public shell for landing, receipts and /why — on a 12-column grid, without changing any payment behaviour.

**Architecture:** One token module feeds CSS variables, the antd theme and a contrast test. The theme is resolved from cookies on the server so the first HTML is already correct. Next.js route groups `(app)` and `(public)` give each route its shell without changing URLs. Wallet state moves from three pages into one `WalletProvider`, whose transitions are pure, tested functions that keep the rule "never drop the wallet while a transaction hash is held".

**Tech Stack:** Next.js 16.3.5 App Router, React 19, antd 6.6.5 with `@ant-design/nextjs-registry` 1.3.0, viem, vitest 2 (already set up in `apps/web`), IBM Plex via `next/font`.

**Spec:** `docs/superpowers/specs/2026-09-23-redesign-shell-design.md`

## Global Constraints

- No change to `packages/core` behaviour, the payout sequence, or any invariant in `CLAUDE.md`.
- URLs do not change: `/`, `/new`, `/runs`, `/run/[txHash]`, `/r/[txHash]`, `/why`; new: `/dashboard` (placeholder in this part).
- Palette values are exactly those in spec §5.1; every text/background pair ≥ 4.5:1, `control` ≥ 3:1 on `bg` and `surface`.
- Theme cookie `theme` ∈ `dark` | `light` | `system`; companion cookie `theme-system` ∈ `dark` | `light`. Missing or unknown `theme` means `system`; `system` with no `theme-system` renders dark.
- Grid: 12 columns, 24px gap (16px below 640px), max width 1200px; breakpoints `lg` ≥ 1024px, `md` 640–1023px, `sm` < 640px.
- Sidebar 232px at `lg`, 64px icons at `md`, hidden at `sm` where a bottom tab bar (Dashboard, New payout, Runs) and a top-bar "⋯" menu (How it works, theme) take over.
- No new runtime dependencies. Icons are inline SVG.
- User-visible copy follows the plain-language rule: no "manifest", "anchor", "salt", "preflight", "commit", "root", "Merkle", "run label" (enforced by `apps/web/test/plain-language.test.ts`).
- Commit after every task with the repo's `type(scope): sentence` style and the Co-Authored-By trailer. Never push.

## Review Focus

1. **The wallet changes account while a payment is being sent.** Expected: the disconnect is queued, the send screen keeps its transaction hash, and the account change applies once the send settles. Pinned in Task 6 (`sessionReducer` hold tests) and Task 10 (browser check).
2. **A hostile or garbage `theme` cookie** (`theme=</script><script>alert(1)`). Expected: treated as `system`; nothing from the cookie is ever written into the HTML except one of two fixed strings. Pinned in Task 2.
3. **`?n=mainnet` on an app route.** Expected: the network badge, wallet provider and page all use mainnet, not the default network. Pinned in Task 7 (`networkFromSearch` test).
4. **A browser without `matchMedia` or with cookies blocked.** Expected: the boot script does nothing and throws nothing; the page stays dark and usable. Pinned in Task 2 (`BOOT_SCRIPT` run against stub globals).
5. **Chain or account changes after a run is confirmed.** Expected: the result screen with its receipt links stays; before confirmation, a prepared run is discarded. Pinned in Task 6 (`shouldResetPrepared` tests).

---

## File Structure

```
apps/web/
  app/
    layout.tsx                       MODIFY  cookies → data-theme, token CSS, boot script, ThemeProvider
    theme.ts                         DELETE  replaced by lib/theme.ts
    globals.css                      MODIFY  old vars become aliases; grid, shell, a11y utilities
    (public)/layout.tsx              CREATE  PublicShell
    (public)/page.tsx                MOVE    from app/page.tsx
    (public)/r/[txHash]/*            MOVE    from app/r/[txHash]/*
    (public)/why/*                   MOVE    from app/why/*
    (app)/layout.tsx                 CREATE  WalletProvider + AppShell
    (app)/dashboard/page.tsx         CREATE  placeholder
    (app)/new/*                      MOVE    from app/new/*   (CreateRun modified in Task 10)
    (app)/runs/*                     MOVE    from app/runs/*  (RunHistory modified in Task 10)
    (app)/run/[txHash]/*             MOVE    from app/run/[txHash]/*
  lib/
    theme-tokens.ts                  CREATE  palettes, tokenCss()
    theme.ts                         CREATE  resolveTheme, antdTheme, BOOT_SCRIPT, cookie names
    grid.ts                          CREATE  colVars()
    nav.ts                           CREATE  APP_NAV, LEARN_NAV, activeHref, pageTitle
    wallet-session.ts                CREATE  sessionReducer, shouldResetPrepared
    connect-error.ts                 CREATE  ConnectError, describeConnectError (moved from CreateRun)
    use-network.ts                   CREATE  networkFromSearch, useNetwork
  components/
    theme/ThemeProvider.tsx          CREATE
    grid/Grid.tsx                    CREATE  Grid, Col
    wallet/WalletProvider.tsx        CREATE  WalletProvider, useWallet
    shell/icons.tsx                  CREATE
    shell/SideNav.tsx                CREATE
    shell/BottomTabs.tsx             CREATE
    shell/TopBar.tsx                 CREATE
    shell/NetworkBadge.tsx           CREATE
    shell/WalletButton.tsx           CREATE
    shell/ThemeToggle.tsx            CREATE
    shell/MoreMenu.tsx               CREATE
    shell/AppShell.tsx               CREATE
    shell/PublicShell.tsx            CREATE
  test/
    theme-tokens.test.ts             CREATE
    theme.test.ts                    CREATE
    grid.test.ts                     CREATE
    nav.test.ts                      CREATE
    wallet-session.test.ts           CREATE
    network.test.ts                  CREATE
```

All commands run from `apps/web` unless stated. `npx vitest run <file>` runs one test file; `pnpm test` at the repo root runs everything.

---

### Task 1: Theme tokens and the contrast guarantee

**Files:**
- Create: `apps/web/lib/theme-tokens.ts`
- Test: `apps/web/test/theme-tokens.test.ts`

**Interfaces:**
- Produces: `type Mode = "dark" | "light"`, `interface Palette`, `const palettes: Record<Mode, Palette>`, `function contrast(fg: string, bg: string): number`, `function tokenCss(): string` (CSS text declaring `--bg`, `--surface`, `--raised`, `--sidebar`, `--border`, `--control`, `--text`, `--text-soft`, `--link`, `--accent`, `--on-accent`, `--success`, `--warning`, `--danger`, `--success-bg`, `--warning-bg`, `--danger-bg` under `html[data-theme="dark"]` and `html[data-theme="light"]`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/theme-tokens.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/theme-tokens.test.ts`
Expected: FAIL — `Cannot find module '@/lib/theme-tokens'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/theme-tokens.ts
/**
 * The single source of colour. CSS variables, the antd theme and the contrast
 * test all read from here, so a colour cannot drift between them. Every value
 * was measured against WCAG 2 before it went in (spec §5.1); the test in
 * test/theme-tokens.test.ts keeps it that way.
 */
export type Mode = "dark" | "light";

export interface Palette {
  bg: string; surface: string; raised: string; sidebar: string;
  /** Decorative rules only — WCAG exempts them. */
  border: string;
  /** Edges a user must see to operate: inputs, outline buttons, the wallet chip. ≥ 3:1. */
  control: string;
  text: string; textSoft: string; link: string;
  accent: string; onAccent: string;
  success: string; warning: string; danger: string;
  successBg: string; warningBg: string; dangerBg: string;
}

export const palettes: Record<Mode, Palette> = {
  dark: {
    bg: "#0B1220", surface: "#101929", raised: "#15213A", sidebar: "#080E1A",
    border: "#1B2436", control: "#5F7090",
    text: "#E4E9F2", textSoft: "#98A3B8", link: "#7FB0FF",
    accent: "#4C8DFF", onAccent: "#051024",
    success: "#5EE0A0", warning: "#F2C35B", danger: "#FF8C9B",
    successBg: "#0F3326", warningBg: "#33290F", dangerBg: "#3B1720",
  },
  light: {
    bg: "#F5F7FB", surface: "#FFFFFF", raised: "#E8EFFB", sidebar: "#EEF2F8",
    border: "#DCE3EE", control: "#7C889E",
    text: "#0E1726", textSoft: "#4F5B70", link: "#1A56C4",
    accent: "#1F5FD6", onAccent: "#FFFFFF",
    success: "#0B6E48", warning: "#7A5000", danger: "#B0222E",
    successBg: "#E2F4EC", warningBg: "#FBF0D9", dangerBg: "#FBE4E6",
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/theme-tokens.test.ts`
Expected: PASS (all pairs; 60+ tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/theme-tokens.ts apps/web/test/theme-tokens.test.ts
git commit -m "feat(web): one token module for both themes, contrast-tested"
```

---

### Task 2: Theme resolution, antd theme and the boot script

**Files:**
- Create: `apps/web/lib/theme.ts`
- Test: `apps/web/test/theme.test.ts`

**Interfaces:**
- Consumes: `palettes`, `Mode` from Task 1.
- Produces: `type ThemeChoice = "dark" | "light" | "system"`; `THEME_COOKIE = "theme"`; `SYSTEM_COOKIE = "theme-system"`; `resolveTheme(theme?: string | null, system?: string | null): { choice: ThemeChoice; mode: Mode }`; `antdTheme(mode: Mode): ThemeConfig`; `BOOT_SCRIPT: string`; `themeCookie(name: string, value: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/theme.test.ts
import { describe, it, expect } from "vitest";
import { theme as antd } from "antd";
import { resolveTheme, antdTheme, BOOT_SCRIPT, themeCookie } from "@/lib/theme";
import { palettes } from "@/lib/theme-tokens";

describe("resolveTheme", () => {
  it("honours an explicit choice whatever the system says", () => {
    expect(resolveTheme("light", "dark")).toEqual({ choice: "light", mode: "light" });
    expect(resolveTheme("dark", "light")).toEqual({ choice: "dark", mode: "dark" });
  });
  it("follows the recorded system value when the choice is system or missing", () => {
    expect(resolveTheme("system", "light")).toEqual({ choice: "system", mode: "light" });
    expect(resolveTheme(undefined, "light")).toEqual({ choice: "system", mode: "light" });
  });
  it("renders dark on a first visit, before the system value is known", () => {
    expect(resolveTheme(undefined, undefined)).toEqual({ choice: "system", mode: "dark" });
  });
  it("treats a garbage or hostile cookie as system, never echoing it", () => {
    const r = resolveTheme("</script><script>alert(1)", "<b>");
    expect(r).toEqual({ choice: "system", mode: "dark" });
  });
});

describe("antdTheme", () => {
  it("uses the dark algorithm and the dark palette in dark mode", () => {
    const t = antdTheme("dark");
    expect(t.algorithm).toBe(antd.darkAlgorithm);
    expect(t.token?.colorPrimary).toBe(palettes.dark.accent);
    expect(t.token?.colorLink).toBe(palettes.dark.link);
    expect(t.token?.colorBgBase).toBe(palettes.dark.bg);
    expect(t.token?.colorTextSecondary).toBe(palettes.dark.textSoft);
    expect(t.token?.colorSuccessBg).toBe(palettes.dark.successBg);
  });
  it("uses the default algorithm and the light palette in light mode", () => {
    const t = antdTheme("light");
    expect(t.algorithm).toBe(antd.defaultAlgorithm);
    expect(t.token?.colorText).toBe(palettes.light.text);
  });
});

/** Runs the boot script against stub globals, as a browser would before paint. */
function boot(choice: string, matchMedia?: (q: string) => { matches: boolean }) {
  const attrs: Record<string, string> = { "data-theme-choice": choice, "data-theme": "dark" };
  const doc = {
    cookie: "",
    documentElement: {
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
    },
  };
  const win = matchMedia ? { matchMedia } : {};
  new Function("document", "window", BOOT_SCRIPT)(doc, win);
  return { attrs, cookie: doc.cookie };
}

describe("BOOT_SCRIPT", () => {
  it("applies and records a light system preference when the choice is system", () => {
    const { attrs, cookie } = boot("system", () => ({ matches: true }));
    expect(attrs["data-theme"]).toBe("light");
    expect(cookie).toContain("theme-system=light");
  });
  it("leaves an explicit choice alone", () => {
    const { attrs, cookie } = boot("dark", () => ({ matches: true }));
    expect(attrs["data-theme"]).toBe("dark");
    expect(cookie).toBe("");
  });
  it("does nothing and throws nothing without matchMedia", () => {
    expect(() => boot("system")).not.toThrow();
    expect(boot("system").attrs["data-theme"]).toBe("dark");
  });
});

describe("themeCookie", () => {
  it("is site-wide, a year long and lax", () => {
    expect(themeCookie("theme", "light")).toBe("theme=light; path=/; max-age=31536000; samesite=lax");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/theme.test.ts`
Expected: FAIL — `Cannot find module '@/lib/theme'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/theme.ts
import { theme, type ThemeConfig } from "antd";
import { palettes, type Mode } from "@/lib/theme-tokens";

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_COOKIE = "theme";
export const SYSTEM_COOKIE = "theme-system";

/**
 * What the server renders. Only two fixed strings ever leave this function,
 * so nothing from a cookie can reach the HTML. Missing or unknown means
 * "system"; system with no recorded value is dark, the product default.
 */
export function resolveTheme(
  themeCookie?: string | null, systemCookie?: string | null,
): { choice: ThemeChoice; mode: Mode } {
  const choice: ThemeChoice =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : "system";
  if (choice !== "system") return { choice, mode: choice };
  return { choice, mode: systemCookie === "light" ? "light" : "dark" };
}

export function themeCookie(name: string, value: string): string {
  return `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** antd computes colour in JS; these tokens pin it to our palette. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorLink: p.link,
      colorInfo: p.link,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.danger,
      colorText: p.text,
      colorTextSecondary: p.textSoft,
      colorTextTertiary: p.textSoft,
      colorTextDescription: p.textSoft,
      colorTextPlaceholder: p.textSoft,
      colorTextLightSolid: p.onAccent,
      colorBgBase: p.bg,
      colorBgLayout: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.surface,
      colorBorder: p.control,
      colorBorderSecondary: p.border,
      colorSuccessBg: p.successBg,
      colorWarningBg: p.warningBg,
      colorErrorBg: p.dangerBg,
      colorInfoBg: p.raised,
      borderRadius: 6,
      fontFamily: "var(--font-sans)",
      fontSize: 15,
      lineHeight: 1.6,
    },
    components: {
      Table: { headerBg: p.surface, rowHoverBg: p.raised, borderColor: p.border, footerBg: p.surface },
      Tag: { defaultBg: p.raised, defaultColor: p.text },
      Alert: {
        colorInfoBorder: p.border, colorSuccessBorder: p.border,
        colorWarningBorder: p.border, colorErrorBorder: p.border,
      },
      Steps: { colorTextDescription: p.textSoft },
    },
  };
}

/**
 * Runs in <head> before first paint. When the user has not chosen, it applies
 * the system preference to our CSS and records it for the next server render.
 * It never touches the `theme` cookie, so "system" keeps following the OS,
 * and it swallows every error — a browser without matchMedia stays dark.
 */
export const BOOT_SCRIPT =
  `(function(){try{var d=document.documentElement;` +
  `if(d.getAttribute("data-theme-choice")!=="system")return;` +
  `if(!window.matchMedia)return;` +
  `var m=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";` +
  `d.setAttribute("data-theme",m);` +
  `document.cookie="${SYSTEM_COOKIE}="+m+"; path=/; max-age=31536000; samesite=lax"` +
  `}catch(e){}})();`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/theme.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/theme.ts apps/web/test/theme.test.ts
git commit -m "feat(web): resolve the theme from cookies, and boot it before paint"
```

---

### Task 3: Render the theme from the server

**Files:**
- Create: `apps/web/components/theme/ThemeProvider.tsx`
- Modify: `apps/web/app/layout.tsx` (whole file)
- Modify: `apps/web/app/globals.css:1-11` (`:root` block) and `:140-151` (the `prefers-color-scheme` block)
- Delete: `apps/web/app/theme.ts`

**Interfaces:**
- Consumes: `tokenCss`, `resolveTheme`, `antdTheme`, `BOOT_SCRIPT`, `themeCookie`, `THEME_COOKIE`, `SYSTEM_COOKIE`.
- Produces: `ThemeProvider({ initial, children })`, `useTheme(): { choice: ThemeChoice; mode: Mode; setChoice(c: ThemeChoice): void }`.

- [ ] **Step 1: Write the ThemeProvider**

```tsx
// apps/web/components/theme/ThemeProvider.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ConfigProvider } from "antd";
import type { Mode } from "@/lib/theme-tokens";
import {
  antdTheme, themeCookie, THEME_COOKIE, SYSTEM_COOKIE, type ThemeChoice,
} from "@/lib/theme";

interface ThemeApi { choice: ThemeChoice; mode: Mode; setChoice: (c: ThemeChoice) => void }
const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext);
  if (!api) throw new Error("useTheme must be used inside ThemeProvider");
  return api;
}

const systemMode = (): Mode =>
  window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

export function ThemeProvider({
  initial, children,
}: { initial: { choice: ThemeChoice; mode: Mode }; children: React.ReactNode }) {
  const [choice, setChoiceState] = useState(initial.choice);
  const [mode, setMode] = useState(initial.mode);

  const apply = useCallback((m: Mode) => {
    document.documentElement.setAttribute("data-theme", m);
    setMode(m);
  }, []);

  // The boot script may already have moved our CSS to the system theme; antd
  // follows it here. This is the one re-colour the spec accepts (§5.3).
  useEffect(() => {
    const m = document.documentElement.getAttribute("data-theme");
    if (m === "dark" || m === "light") setMode(m);
  }, []);

  // While following the system, follow it live.
  useEffect(() => {
    if (choice !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const m = mq.matches ? "light" : "dark";
      document.cookie = themeCookie(SYSTEM_COOKIE, m);
      apply(m);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice, apply]);

  const setChoice = useCallback((c: ThemeChoice) => {
    document.cookie = themeCookie(THEME_COOKIE, c);
    document.documentElement.setAttribute("data-theme-choice", c);
    setChoiceState(c);
    apply(c === "system" ? systemMode() : c);
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ choice, mode, setChoice }}>
      <ConfigProvider theme={antdTheme(mode)}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Rewrite the root layout**

```tsx
// apps/web/app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { tokenCss } from "@/lib/theme-tokens";
import { resolveTheme, BOOT_SCRIPT, THEME_COOKIE, SYSTEM_COOKIE } from "@/lib/theme";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Ledgerline",
  description: "Verify a stablecoin payout on Arc without trusting the payer.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so the first HTML already carries the right theme —
  // antd colours in JS, and a client-only switch would flash.
  const jar = await cookies();
  const initial = resolveTheme(jar.get(THEME_COOKIE)?.value, jar.get(SYSTEM_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      data-theme={initial.mode}
      data-theme-choice={initial.choice}
      // The boot script may change data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokenCss() }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {/* Without this wrapper antd's styles arrive after first paint and the
            page flashes unstyled on SSR. */}
        <AntdRegistry>
          <ThemeProvider initial={initial}>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Turn the old CSS variables into aliases**

Replace the `:root { … }` block at the top of `apps/web/app/globals.css` with:

```css
/* The pages built before the redesign use these names. They alias the new
   tokens (lib/theme-tokens.ts) until part 3 migrates each page, then go. */
:root {
  --ground: var(--bg);
  --raised: var(--surface);
  --ink: var(--text);
  --ink-soft: var(--text-soft);
  --rule: var(--border);
  --ruleStrong: var(--text);
  --tick: var(--success);
  --flag: var(--danger);
  --pending: var(--warning);
  --measure: 62ch;
}
```

Delete the whole `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` block — the theme is now chosen by `data-theme`, and that block would override it.

- [ ] **Step 4: Delete the old antd theme**

```bash
git rm apps/web/app/theme.ts
```

- [ ] **Step 5: Verify build, tests, and the server-rendered theme**

Run: `npx tsc --noEmit && npx vitest run && pnpm build`
Expected: no type errors; all tests pass; build succeeds.

Run: `pnpm start --port 3055 &` then:

```bash
curl -s -H 'Cookie: theme=light' http://localhost:3055/ | grep -o 'data-theme="[a-z]*"' | head -1
curl -s http://localhost:3055/ | grep -o 'data-theme="[a-z]*"' | head -1
curl -s -H 'Cookie: theme=system; theme-system=light' http://localhost:3055/ | grep -o 'data-theme="[a-z]*"' | head -1
```

Expected, in order: `data-theme="light"`, `data-theme="dark"`, `data-theme="light"`. Stop the server: `kill $(lsof -tiTCP:3055 -sTCP:LISTEN)`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/app/layout.tsx apps/web/app/globals.css apps/web/components/theme
git commit -m "feat(web): render the theme from cookies so the first paint is right"
```

---

### Task 4: The 12-column grid

**Files:**
- Create: `apps/web/lib/grid.ts`, `apps/web/components/grid/Grid.tsx`
- Modify: `apps/web/app/globals.css` (append grid rules)
- Test: `apps/web/test/grid.test.ts`

**Interfaces:**
- Produces: `interface ColLayout { span?: number; start?: number }`, `interface ColProps extends ColLayout { md?: ColLayout | number; sm?: ColLayout | number; sticky?: boolean }`, `colVars(p: ColProps): Record<string, string>`, components `Grid({ children, className? })`, `Col({ children, …ColProps, className?, as? })`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/grid.test.ts
import { describe, it, expect } from "vitest";
import { colVars } from "@/lib/grid";

describe("colVars — a column's placement at each breakpoint", () => {
  it("defaults to a full-width row", () => {
    expect(colVars({})).toEqual({
      "--span": "12", "--start": "auto",
      "--md-span": "12", "--md-start": "auto",
      "--sm-span": "12", "--sm-start": "auto",
    });
  });
  it("lets md inherit lg, and makes sm full width unless told otherwise", () => {
    expect(colVars({ span: 8 })).toMatchObject({
      "--span": "8", "--md-span": "8", "--sm-span": "12",
    });
  });
  it("accepts a bare number as a span at a breakpoint", () => {
    expect(colVars({ span: 4, md: 12 })).toMatchObject({ "--md-span": "12", "--md-start": "auto" });
  });
  it("places a centred column with a start", () => {
    expect(colVars({ start: 4, span: 6, sm: 12 })).toMatchObject({
      "--start": "4", "--span": "6", "--md-start": "4", "--md-span": "6", "--sm-span": "12",
    });
  });
  it("refuses a span or start that cannot fit twelve columns", () => {
    expect(() => colVars({ span: 13 })).toThrow(RangeError);
    expect(() => colVars({ span: 0 })).toThrow(RangeError);
    expect(() => colVars({ start: 10, span: 4 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/grid.test.ts`
Expected: FAIL — `Cannot find module '@/lib/grid'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/grid.ts
export interface ColLayout { span?: number; start?: number }
export interface ColProps extends ColLayout {
  /** 640–1023px. A number is a span. Absent: same as lg. */
  md?: ColLayout | number;
  /** Below 640px. A number is a span. Absent: full width. */
  sm?: ColLayout | number;
  /** Sticks while scrolling, at lg only. */
  sticky?: boolean;
}

const asLayout = (l: ColLayout | number | undefined): ColLayout | undefined =>
  typeof l === "number" ? { span: l } : l;

function check({ span = 12, start }: ColLayout): void {
  if (!Number.isInteger(span) || span < 1 || span > 12) {
    throw new RangeError(`span must be 1–12, got ${span}`);
  }
  if (start !== undefined && (!Number.isInteger(start) || start < 1 || start + span > 13)) {
    throw new RangeError(`start ${start} with span ${span} does not fit 12 columns`);
  }
}

/**
 * CSS custom properties that globals.css turns into grid-column at each
 * breakpoint. Variables rather than 12×3 generated classes: one rule per
 * breakpoint, and the placement is readable in devtools.
 */
export function colVars(p: ColProps): Record<string, string> {
  const lg: ColLayout = { span: p.span ?? 12, start: p.start };
  const md: ColLayout = asLayout(p.md) ?? lg;
  const sm: ColLayout = asLayout(p.sm) ?? { span: 12 };
  for (const l of [lg, md, sm]) check(l);
  const out = (l: ColLayout) => [String(l.span ?? 12), l.start ? String(l.start) : "auto"] as const;
  const [s, st] = out(lg); const [ms, mst] = out(md); const [ss, sst] = out(sm);
  return {
    "--span": s, "--start": st,
    "--md-span": ms, "--md-start": mst,
    "--sm-span": ss, "--sm-start": sst,
  };
}
```

```tsx
// apps/web/components/grid/Grid.tsx
import type { CSSProperties, ReactNode } from "react";
import { colVars, type ColProps } from "@/lib/grid";

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `grid ${className}` : "grid"}>{children}</div>;
}

export function Col({
  children, className, as: Tag = "div", sticky, ...layout
}: ColProps & { children: ReactNode; className?: string; as?: "div" | "section" | "aside" }) {
  const cls = ["col", sticky ? "is-sticky" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls} style={colVars(layout) as CSSProperties}>{children}</Tag>;
}
```

- [ ] **Step 4: Append the grid rules to `apps/web/app/globals.css`**

```css
/* ── 12-column grid (lib/grid.ts sets the variables) ─────────────────── */
.grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 24px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}
.col { min-width: 0; grid-column: var(--start) / span var(--span); }
@media (min-width: 1024px) {
  .col.is-sticky { position: sticky; top: 88px; align-self: start; }
}
@media (max-width: 1023px) {
  .col { grid-column: var(--md-start) / span var(--md-span); }
}
@media (max-width: 639px) {
  .grid { gap: 16px; }
  .col { grid-column: var(--sm-start) / span var(--sm-span); }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/grid.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests); no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/grid.ts apps/web/components/grid apps/web/test/grid.test.ts apps/web/app/globals.css
git commit -m "feat(web): a 12-column grid with lg, md and sm placement"
```

---

### Task 5: Navigation model

**Files:**
- Create: `apps/web/lib/nav.ts`
- Test: `apps/web/test/nav.test.ts`

**Interfaces:**
- Produces: `type IconName = "dashboard" | "new" | "runs" | "learn"`, `interface NavItem { href: string; label: string; icon: IconName }`, `APP_NAV: NavItem[]`, `LEARN_NAV: NavItem[]`, `activeHref(pathname: string): string | undefined`, `pageTitle(pathname: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/nav.test.ts
import { describe, it, expect } from "vitest";
import { APP_NAV, LEARN_NAV, activeHref, pageTitle } from "@/lib/nav";

describe("navigation", () => {
  it("lists the app's three destinations in order, then How it works", () => {
    expect(APP_NAV.map((i) => i.href)).toEqual(["/dashboard", "/new", "/runs"]);
    expect(LEARN_NAV.map((i) => i.href)).toEqual(["/why"]);
  });

  it("marks the right item for every route, including dynamic ones", () => {
    expect(activeHref("/dashboard")).toBe("/dashboard");
    expect(activeHref("/new")).toBe("/new");
    expect(activeHref("/runs")).toBe("/runs");
    // A single run belongs under Runs.
    expect(activeHref("/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5")).toBe("/runs");
    expect(activeHref("/why")).toBe("/why");
    expect(activeHref("/")).toBeUndefined();
    // /runs must not claim /runsomething.
    expect(activeHref("/runsomething")).toBeUndefined();
  });

  it("titles each app route", () => {
    expect(pageTitle("/dashboard")).toBe("Dashboard");
    expect(pageTitle("/new")).toBe("New payout run");
    expect(pageTitle("/runs")).toBe("Your payout runs");
    expect(pageTitle("/run/0xabc")).toBe("Payout run");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/nav.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nav'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/nav.ts
export type IconName = "dashboard" | "new" | "runs" | "learn";
export interface NavItem { href: string; label: string; icon: IconName }

export const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/new", label: "New payout", icon: "new" },
  { href: "/runs", label: "Runs", icon: "runs" },
];

export const LEARN_NAV: NavItem[] = [
  { href: "/why", label: "How it works", icon: "learn" },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Which nav item a route belongs to. A single run (/run/…) sits under Runs. */
export function activeHref(pathname: string): string | undefined {
  if (under(pathname, "/dashboard")) return "/dashboard";
  if (under(pathname, "/new")) return "/new";
  if (under(pathname, "/runs") || pathname.startsWith("/run/")) return "/runs";
  if (under(pathname, "/why")) return "/why";
  return undefined;
}

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/run/")) return "Payout run";
  switch (activeHref(pathname)) {
    case "/dashboard": return "Dashboard";
    case "/new": return "New payout run";
    case "/runs": return "Your payout runs";
    default: return "Ledgerline";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/nav.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/nav.ts apps/web/test/nav.test.ts
git commit -m "feat(web): one navigation model for sidebar, tabs and titles"
```

---

### Task 6: Wallet session transitions

**Files:**
- Create: `apps/web/lib/wallet-session.ts`
- Test: `apps/web/test/wallet-session.test.ts`

**Interfaces:**
- Produces:
  - `interface SessionWallet { address: string; chainId: number }`
  - `interface Session<W extends SessionWallet> { wallet?: W; held: boolean; forgetQueued: boolean }`
  - `type SessionEvent<W> = { type: "connected"; wallet: W } | { type: "forget" } | { type: "hold"; on: boolean } | { type: "chain"; chainId: number }`
  - `initialSession<W>(): Session<W>`
  - `sessionReducer<W extends SessionWallet>(s: Session<W>, e: SessionEvent<W>): Session<W>`
  - `shouldResetPrepared(prev: SessionWallet | undefined, next: SessionWallet | undefined, ctx: { confirmed: boolean; held: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/wallet-session.test.ts
import { describe, it, expect } from "vitest";
import { initialSession, sessionReducer, shouldResetPrepared, type SessionWallet } from "@/lib/wallet-session";

const A: SessionWallet = { address: "0xaaa", chainId: 5042002 };
const B: SessionWallet = { address: "0xbbb", chainId: 5042002 };
const connected = sessionReducer(initialSession<SessionWallet>(), { type: "connected", wallet: A });

describe("sessionReducer — the wallet the shell holds", () => {
  it("forgets the wallet at once when nothing is held", () => {
    expect(sessionReducer(connected, { type: "forget" }).wallet).toBeUndefined();
  });

  it("defers a forget while a transaction hash is held, and applies it on release", () => {
    // Dropping the wallet mid-send unmounts the only copy of the hash.
    const held = sessionReducer(connected, { type: "hold", on: true });
    const asked = sessionReducer(held, { type: "forget" });
    expect(asked.wallet).toEqual(A);
    expect(asked.forgetQueued).toBe(true);
    const released = sessionReducer(asked, { type: "hold", on: false });
    expect(released.wallet).toBeUndefined();
    expect(released.forgetQueued).toBe(false);
    expect(released.held).toBe(false);
  });

  it("keeps the wallet when a hold is released with nothing queued", () => {
    const held = sessionReducer(connected, { type: "hold", on: true });
    expect(sessionReducer(held, { type: "hold", on: false }).wallet).toEqual(A);
  });

  it("records a chain change on the wallet", () => {
    expect(sessionReducer(connected, { type: "chain", chainId: 1 }).wallet?.chainId).toBe(1);
  });

  it("ignores a chain change with no wallet", () => {
    const empty = initialSession<SessionWallet>();
    expect(sessionReducer(empty, { type: "chain", chainId: 1 })).toEqual(empty);
  });

  it("clears a queued forget when a new wallet connects", () => {
    const queued = sessionReducer(sessionReducer(connected, { type: "hold", on: true }), { type: "forget" });
    expect(sessionReducer(queued, { type: "connected", wallet: B }).forgetQueued).toBe(false);
  });
});

describe("shouldResetPrepared — when a prepared run no longer belongs to the wallet", () => {
  const idle = { confirmed: false, held: false };
  it("resets on a different account, a lost wallet, or a different chain", () => {
    expect(shouldResetPrepared(A, B, idle)).toBe(true);
    expect(shouldResetPrepared(A, undefined, idle)).toBe(true);
    expect(shouldResetPrepared(A, { ...A, chainId: 1 }, idle)).toBe(true);
  });
  it("keeps it when nothing that binds the salt changed", () => {
    expect(shouldResetPrepared(A, { ...A }, idle)).toBe(false);
    expect(shouldResetPrepared(undefined, A, idle)).toBe(false);
  });
  it("never resets a confirmed run or one being sent", () => {
    expect(shouldResetPrepared(A, B, { confirmed: true, held: false })).toBe(false);
    expect(shouldResetPrepared(A, B, { confirmed: false, held: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/wallet-session.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wallet-session'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/wallet-session.ts
export interface SessionWallet { address: string; chainId: number }

export interface Session<W extends SessionWallet> {
  wallet?: W;
  /** True while a screen holds the only copy of a transaction hash. */
  held: boolean;
  /** A disconnect or account change that arrived while held. */
  forgetQueued: boolean;
}

export type SessionEvent<W> =
  | { type: "connected"; wallet: W }
  | { type: "forget" }
  | { type: "hold"; on: boolean }
  | { type: "chain"; chainId: number };

export function initialSession<W extends SessionWallet>(): Session<W> {
  return { wallet: undefined, held: false, forgetQueued: false };
}

/**
 * Between "your wallet signed it" and "here is the receipt", the send screen
 * holds the only copy of a transaction hash for money that has moved. A
 * forget during that window — the disconnect button, or the wallet switching
 * accounts — is queued and applied once the hold is released, rather than
 * refused or obeyed immediately. Moved here from CreateRun, unchanged.
 */
export function sessionReducer<W extends SessionWallet>(s: Session<W>, e: SessionEvent<W>): Session<W> {
  switch (e.type) {
    case "connected":
      return { wallet: e.wallet, held: s.held, forgetQueued: false };
    case "forget":
      return s.held ? { ...s, forgetQueued: true } : { ...s, wallet: undefined, forgetQueued: false };
    case "hold":
      if (e.on) return { ...s, held: true };
      return s.forgetQueued
        ? { wallet: undefined, held: false, forgetQueued: false }
        : { ...s, held: false };
    case "chain":
      return s.wallet ? { ...s, wallet: { ...s.wallet, chainId: e.chainId } } : s;
  }
}

/**
 * A prepared run is bound to one account on one chain: the run's reference
 * code comes from that account's signature over a message that includes the
 * chain. Any change to either invalidates it — except for a confirmed run,
 * which is a fact about a block, and a run being sent, whose hash must stay.
 */
export function shouldResetPrepared(
  prev: SessionWallet | undefined,
  next: SessionWallet | undefined,
  ctx: { confirmed: boolean; held: boolean },
): boolean {
  if (ctx.confirmed || ctx.held || !prev) return false;
  if (!next) return true;
  return prev.address.toLowerCase() !== next.address.toLowerCase() || prev.chainId !== next.chainId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/wallet-session.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/wallet-session.ts apps/web/test/wallet-session.test.ts
git commit -m "feat(web): wallet session transitions as pure, tested functions"
```

---

### Task 7: WalletProvider and the network from the URL

**Files:**
- Create: `apps/web/lib/connect-error.ts` (move `ConnectError` + `describeConnectError` out of `app/new/CreateRun.tsx:60-107`)
- Create: `apps/web/lib/use-network.ts`
- Create: `apps/web/components/wallet/WalletProvider.tsx`
- Test: `apps/web/test/network.test.ts`

**Interfaces:**
- Consumes: `sessionReducer`, `initialSession` (Task 6); `connect`, `disconnect`, `switchChain`, `watchWallet`, `watchWalletList`, `knownWallets`, `ConnectedWallet`, `WalletChoice` from `lib/wallet.ts`; `networkFor`, `NetworkView` from `lib/chain.ts`; `WalletPicker` from `components/WalletPicker.tsx`.
- Produces:
  - `interface ConnectError { type: "info" | "error"; title: string; description: string }`, `describeConnectError(err: unknown): ConnectError`
  - `networkFromSearch(search: { get(k: string): string | null } | null): NetworkView`, `useNetwork(): NetworkView`
  - `WalletProvider({ children })`, `useWallet(): WalletApi` where
    `interface WalletApi { net: NetworkView; wallet?: ConnectedWallet; wrongChain: boolean; held: boolean; connecting: boolean; error?: ConnectError; switching: boolean; switchError?: string; connect(): void; disconnect(): Promise<void>; switchToArc(): Promise<void>; setHold(on: boolean): void }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/network.test.ts
import { describe, it, expect } from "vitest";
import { networkFromSearch } from "@/lib/use-network";
import { defaultNetwork } from "@/lib/chain";

const search = (q: string) => new URLSearchParams(q);

describe("networkFromSearch — the network an app route runs on", () => {
  it("honours ?n=mainnet and ?n=testnet", () => {
    expect(networkFromSearch(search("n=mainnet")).name).toBe("mainnet");
    expect(networkFromSearch(search("n=testnet")).name).toBe("testnet");
  });
  it("falls back to the configured default for anything else", () => {
    expect(networkFromSearch(search("")).name).toBe(defaultNetwork().name);
    expect(networkFromSearch(search("n=goerli")).name).toBe(defaultNetwork().name);
    expect(networkFromSearch(null).name).toBe(defaultNetwork().name);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/network.test.ts`
Expected: FAIL — `Cannot find module '@/lib/use-network'`.

- [ ] **Step 3: Write `lib/use-network.ts`**

```ts
// apps/web/lib/use-network.ts
"use client";

import { useSearchParams } from "next/navigation";
import { networkFor, type NetworkView } from "@/lib/chain";

/** ?n= picks the network on every route, as the pages already do. */
export function networkFromSearch(search: { get(k: string): string | null } | null): NetworkView {
  return networkFor(search?.get("n") ?? null);
}

export function useNetwork(): NetworkView {
  return networkFromSearch(useSearchParams());
}
```

Run: `npx vitest run test/network.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Move connect-error handling into `lib/connect-error.ts`**

Cut `ConnectError` and `describeConnectError` (with their doc comments) out of `apps/web/app/new/CreateRun.tsx` and paste them into the new file, exported, with these imports:

```ts
// apps/web/lib/connect-error.ts
import { EoaRequiredError } from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";

/** The title and body of a connect-failure message. Kept together so the two
 *  can never drift apart the way a bare string once let them. */
export interface ConnectError {
  type: "info" | "error";
  title: string;
  description: string;
}

export function describeConnectError(err: unknown): ConnectError {
  if (errorCode(err) === 4001) {
    return { type: "info", title: "Connection cancelled", description: "Click connect again when you're ready." };
  }
  if (err instanceof EoaRequiredError) {
    return { type: "error", title: "This wallet cannot sign a Ledgerline run", description: err.message };
  }
  return { type: "error", title: "Couldn't connect to your wallet", description: describeError(err) };
}
```

Keep the existing three-case doc comment from CreateRun above `describeConnectError`.

- [ ] **Step 5: Write the provider**

```tsx
// apps/web/components/wallet/WalletProvider.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useState } from "react";
import {
  connect as connectWallet, disconnect as disconnectWallet, switchChain,
  watchWallet, watchWalletList, knownWallets,
  type ConnectedWallet, type WalletChoice,
} from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";
import { describeConnectError, type ConnectError } from "@/lib/connect-error";
import { initialSession, sessionReducer } from "@/lib/wallet-session";
import { useNetwork } from "@/lib/use-network";
import type { NetworkView } from "@/lib/chain";
import WalletPicker from "@/components/WalletPicker";

export interface WalletApi {
  net: NetworkView;
  wallet?: ConnectedWallet;
  wrongChain: boolean;
  held: boolean;
  connecting: boolean;
  error?: ConnectError;
  switching: boolean;
  switchError?: string;
  connect(): void;
  disconnect(): Promise<void>;
  switchToArc(): Promise<void>;
  /** Set by the send screen while it holds the only copy of a tx hash. */
  setHold(on: boolean): void;
}

const WalletContext = createContext<WalletApi | null>(null);

export function useWallet(): WalletApi {
  const api = useContext(WalletContext);
  if (!api) throw new Error("useWallet must be used inside WalletProvider");
  return api;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const net = useNetwork();
  const [session, dispatch] = useReducer(sessionReducer<ConnectedWallet>, initialSession<ConnectedWallet>());
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<ConnectError>();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string>();
  const wallet = session.wallet;

  // Wallets announce themselves asynchronously; one that wakes late must
  // still appear in the picker.
  useEffect(() => watchWalletList(() => setChoices(knownWallets())), []);

  // Bound to the connected wallet, so another installed wallet's events do
  // not tear the session down.
  useEffect(() => {
    if (!wallet) return;
    return watchWallet(wallet, {
      accountLost: () => dispatch({ type: "forget" }),
      chainChanged: (chainId) => { setSwitchError(undefined); dispatch({ type: "chain", chainId }); },
    });
  }, [wallet]);

  const connectTo = useCallback(async (choice?: WalletChoice) => {
    setPicking(false);
    setError(undefined);
    setConnecting(true);
    try { dispatch({ type: "connected", wallet: await connectWallet(net, choice) }); }
    catch (err) { setError(describeConnectError(err)); }
    finally { setConnecting(false); }
  }, [net]);

  const connect = useCallback(() => {
    const found = knownWallets();
    setChoices(found);
    // One wallet is not a choice; no wallet needs connect's own error.
    if (found.length > 1) { setPicking(true); return; }
    void connectTo(found[0]);
  }, [connectTo]);

  // Revoke before forgetting, so the next connect prompts instead of silently
  // reattaching the same account.
  const disconnect = useCallback(async () => {
    if (!session.held) await disconnectWallet(wallet);
    setError(undefined);
    dispatch({ type: "forget" });
  }, [wallet, session.held]);

  const switchToArc = useCallback(async () => {
    if (!wallet) return;
    setSwitching(true);
    setSwitchError(undefined);
    try {
      // Read back, never assumed: a wallet can decline without throwing.
      const id = await switchChain(wallet, net);
      dispatch({ type: "chain", chainId: id });
      if (id !== net.chain.id) {
        setSwitchError(`The wallet is still on chain ${id || "unknown"}. Switch it to Arc ${net.name} from the wallet itself, then try again.`);
      }
    } catch (err) {
      setSwitchError(errorCode(err) === 4001
        ? "You dismissed the network prompt. Nothing changed — press the button again when you're ready."
        : describeError(err));
    } finally {
      setSwitching(false);
    }
  }, [wallet, net]);

  const setHold = useCallback((on: boolean) => dispatch({ type: "hold", on }), []);

  const api: WalletApi = {
    net, wallet,
    wrongChain: !!wallet && wallet.chainId !== net.chain.id,
    held: session.held,
    connecting, error, switching, switchError,
    connect, disconnect, switchToArc, setHold,
  };

  return (
    <WalletContext.Provider value={api}>
      {children}
      <WalletPicker choices={choices} open={picking} onPick={(c) => void connectTo(c)} onCancel={() => setPicking(false)} />
    </WalletContext.Provider>
  );
}
```

- [ ] **Step 6: Point CreateRun at the moved module (no behaviour change yet)**

In `apps/web/app/new/CreateRun.tsx`, replace the removed definitions with:

```ts
import { describeConnectError, type ConnectError } from "@/lib/connect-error";
```

In `apps/web/app/new/StepPreview.tsx`, change `import type { ConnectError, RunDraft } from "./CreateRun";` to:

```ts
import type { RunDraft } from "./CreateRun";
import type { ConnectError } from "@/lib/connect-error";
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/connect-error.ts apps/web/lib/use-network.ts apps/web/components/wallet apps/web/test/network.test.ts apps/web/app/new/CreateRun.tsx apps/web/app/new/StepPreview.tsx
git commit -m "feat(web): one wallet provider for the app, network read from the URL"
```

---

### Task 8: Shell components

**Files:**
- Create: `apps/web/components/shell/{icons,SideNav,BottomTabs,TopBar,NetworkBadge,WalletButton,ThemeToggle,MoreMenu,AppShell,PublicShell}.tsx`
- Modify: `apps/web/app/globals.css` (append shell rules)

**Interfaces:**
- Consumes: `APP_NAV`, `LEARN_NAV`, `activeHref`, `pageTitle`, `IconName` (Task 5); `useWallet` (Task 7); `useTheme`, `ThemeChoice` (Tasks 2–3); `useNetwork` (Task 7); `short` from `lib/chain.ts`.
- Produces: `AppShell({ children })`, `PublicShell({ children })`.

- [ ] **Step 1: Icons**

```tsx
// apps/web/components/shell/icons.tsx
import type { IconName } from "@/lib/nav";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  new: "M12 5v14M5 12h14",
  runs: "M5 6h14M5 12h14M5 18h9",
  learn: "M12 17v.01M12 13.5c0-2 2.5-2 2.5-4a2.5 2.5 0 0 0-5 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
};

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
```

- [ ] **Step 2: Sidebar and bottom tabs**

```tsx
// apps/web/components/shell/SideNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV, LEARN_NAV, activeHref, type NavItem } from "@/lib/nav";
import { NavIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";

function Item({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className="nav-item" aria-current={active ? "page" : undefined} title={item.label}>
      <NavIcon name={item.icon} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

export default function SideNav() {
  const current = activeHref(usePathname() ?? "");
  return (
    <nav className="side-nav" aria-label="Main">
      <Link href="/" className="side-brand">Ledgerline</Link>
      {APP_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <p className="nav-group">Learn</p>
      {LEARN_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <div className="side-foot"><ThemeToggle /></div>
    </nav>
  );
}
```

```tsx
// apps/web/components/shell/BottomTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV, activeHref } from "@/lib/nav";
import { NavIcon } from "./icons";

export default function BottomTabs() {
  const current = activeHref(usePathname() ?? "");
  return (
    <nav className="bottom-tabs" aria-label="Main">
      {APP_NAV.map((i) => (
        <Link key={i.href} href={i.href} className="tab" aria-current={current === i.href ? "page" : undefined}>
          <NavIcon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Theme toggle, network badge, "⋯" menu**

```tsx
// apps/web/components/shell/ThemeToggle.tsx
"use client";

import { Segmented } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/theme";

export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <Segmented<ThemeChoice>
      size="small"
      aria-label="Theme"
      value={choice}
      onChange={setChoice}
      options={[
        { label: "Dark", value: "dark" },
        { label: "Light", value: "light" },
        { label: "System", value: "system" },
      ]}
    />
  );
}
```

```tsx
// apps/web/components/shell/NetworkBadge.tsx
"use client";

import { useNetwork } from "@/lib/use-network";

/** Testnet is flagged in the warning colour: its tokens have no value. */
export default function NetworkBadge() {
  const net = useNetwork();
  return (
    <span className={`network-badge${net.name === "testnet" ? " is-test" : ""}`}>
      Arc {net.name}
    </span>
  );
}
```

```tsx
// apps/web/components/shell/MoreMenu.tsx
"use client";

import Link from "next/link";
import { Button, Dropdown } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/theme";

/** Below 640px the sidebar is gone; How it works and the theme live here,
 *  whether or not a wallet is connected. */
export default function MoreMenu() {
  const { choice, setChoice } = useTheme();
  const theme = (c: ThemeChoice, label: string) => ({
    key: `theme-${c}`, label: `${choice === c ? "✓ " : ""}Theme: ${label}`, onClick: () => setChoice(c),
  });
  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: [
        { key: "why", label: <Link href="/why">How it works</Link> },
        { type: "divider" },
        theme("dark", "dark"), theme("light", "light"), theme("system", "system"),
      ] }}
    >
      <Button className="more-menu" aria-label="More">⋯</Button>
    </Dropdown>
  );
}
```

- [ ] **Step 4: Wallet button**

```tsx
// apps/web/components/shell/WalletButton.tsx
"use client";

import { useEffect } from "react";
import { Button, Dropdown, message } from "antd";
import { useWallet } from "@/components/wallet/WalletProvider";
import { short } from "@/lib/chain";

export default function WalletButton() {
  const w = useWallet();
  const [toast, holder] = message.useMessage();

  // A connect failure is announced where the click happened, briefly. A page
  // that needs it to persist (the create flow's review step) shows it too.
  useEffect(() => {
    if (!w.error) return;
    void toast.open({
      type: w.error.type === "info" ? "info" : "error",
      content: `${w.error.title}. ${w.error.description}`,
      duration: 6,
    });
  }, [w.error, toast]);

  if (!w.wallet) {
    return (
      <>
        {holder}
        <Button type="primary" loading={w.connecting} onClick={w.connect}>Connect wallet</Button>
      </>
    );
  }

  // One action on the wrong chain, replacing the two primary buttons the
  // audit found on /new.
  if (w.wrongChain) {
    return (
      <>
      {holder}
      <Button className="wallet-wrong-chain" loading={w.switching} onClick={() => void w.switchToArc()}
        title={w.switchError}>
        Switch to Arc {w.net.name}
      </Button>
      </>
    );
  }

  const address = w.wallet.address;
  return (
    <>
      {holder}
      <Dropdown
        trigger={["click"]}
        menu={{ items: [
          { key: "copy", label: "Copy address", onClick: () => { void navigator.clipboard.writeText(address); void toast.success("Address copied"); } },
          { key: "explorer", label: <a href={`${w.net.explorer}/address/${address}`} target="_blank" rel="noreferrer">View on explorer</a> },
          { type: "divider" },
          {
            key: "disconnect",
            label: w.held ? "Disconnect (after this payment settles)" : "Disconnect",
            // Disabled while a payment holds the only copy of its hash.
            disabled: w.held,
            onClick: () => void w.disconnect(),
          },
        ] }}
      >
        <Button className="wallet-chip"><span className="hex addr">{short(address)}</span></Button>
      </Dropdown>
    </>
  );
}
```

- [ ] **Step 5: Top bar and the two shells**

```tsx
// apps/web/components/shell/TopBar.tsx
"use client";

import { usePathname } from "next/navigation";
import { pageTitle } from "@/lib/nav";
import NetworkBadge from "./NetworkBadge";
import WalletButton from "./WalletButton";
import MoreMenu from "./MoreMenu";

export default function TopBar() {
  return (
    <header className="top-bar">
      <h1 className="top-title">{pageTitle(usePathname() ?? "")}</h1>
      <div className="top-actions">
        <NetworkBadge />
        <WalletButton />
        <span className="only-sm"><MoreMenu /></span>
      </div>
    </header>
  );
}
```

```tsx
// apps/web/components/shell/AppShell.tsx
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
        <main id="main" className="app-main">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
```

```tsx
// apps/web/components/shell/PublicShell.tsx
import Link from "next/link";
import NetworkBadge from "./NetworkBadge";
import ThemeToggle from "./ThemeToggle";
import MoreMenu from "./MoreMenu";

/** For people who were sent a link, or are deciding whether to use the app.
 *  No wallet: a recipient reading a receipt has nothing to connect. */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="public-bar">
        <div className="public-bar-inner">
          <Link href="/" className="side-brand">Ledgerline</Link>
          <nav className="public-links" aria-label="Main">
            <Link href="/why" className="hide-sm">How it works</Link>
            <NetworkBadge />
            <span className="hide-sm"><ThemeToggle /></span>
            <span className="only-sm"><MoreMenu /></span>
            <Link href="/dashboard" className="button-primary">Open app</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="public-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Append shell rules to `apps/web/app/globals.css`**

```css
/* ── shells ───────────────────────────────────────────────────────────── */
body { background: var(--bg); color: var(--text); }
a { color: var(--link); }

.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 16px; top: 12px; z-index: 100; background: var(--surface); padding: 8px 12px; }

.app-shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.side-nav {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; gap: 2px;
  padding: 16px 12px; background: var(--sidebar); border-right: 1px solid var(--border);
}
.side-brand { font-weight: 600; font-size: 1rem; color: var(--text); text-decoration: none; padding: 4px 10px 16px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 6px;
  color: var(--text-soft); text-decoration: none;
}
.nav-item:hover { background: var(--raised); color: var(--text); }
.nav-item[aria-current="page"] { background: var(--raised); color: var(--link); font-weight: 500; }
.nav-group { margin: 16px 10px 4px; font-size: 0.8rem; color: var(--text-soft); }
.side-foot { margin-top: auto; padding: 8px 4px 0; }

.app-body { min-width: 0; display: flex; flex-direction: column; }
.top-bar {
  position: sticky; top: 0; z-index: 10; height: 64px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 0 24px; background: var(--bg); border-bottom: 1px solid var(--border);
}
.top-title { margin: 0; font-size: 1.05rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-actions { display: flex; align-items: center; gap: 10px; }
.app-main { padding: 24px; }
.wallet-wrong-chain { border-color: var(--warning); color: var(--warning); }

.network-badge { padding: 3px 10px; border-radius: 999px; font-size: 0.8rem; border: 1px solid var(--control); color: var(--text-soft); white-space: nowrap; }
.network-badge.is-test { background: var(--warning-bg); color: var(--warning); border-color: var(--warning); }

.bottom-tabs { display: none; }

.public-bar { border-bottom: 1px solid var(--border); background: var(--bg); }
.public-bar-inner { max-width: 1200px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.public-links { display: flex; align-items: center; gap: 16px; }
.public-main { padding: 24px; }

.hex.addr { word-break: normal; white-space: nowrap; }
.only-sm { display: none; }

/* md: sidebar collapses to icons; labels as tooltips, visible on keyboard focus */
@media (max-width: 1023px) {
  .app-shell { grid-template-columns: 64px minmax(0, 1fr); }
  .side-nav { padding: 16px 8px; align-items: center; }
  .side-brand, .nav-group, .side-foot { display: none; }
  .nav-item { position: relative; justify-content: center; }
  .nav-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .nav-item:focus-visible .nav-label {
    width: auto; height: auto; clip-path: none; left: 56px; background: var(--surface);
    border: 1px solid var(--control); padding: 4px 8px; border-radius: 4px; color: var(--text); z-index: 30;
  }
}

/* sm: no sidebar; bottom tabs and the ⋯ menu take over */
@media (max-width: 639px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); }
  .side-nav { display: none; }
  .top-bar, .app-main, .public-main, .public-bar-inner { padding-left: 16px; padding-right: 16px; }
  .app-main { padding-bottom: 88px; }
  .only-sm { display: inline-flex; }
  .hide-sm { display: none; }
  .network-badge { font-size: 0.72rem; padding: 2px 8px; }
  .bottom-tabs {
    display: grid; grid-template-columns: repeat(3, 1fr);
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    background: var(--sidebar); border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bottom-tabs .tab { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 10px; font-size: 0.72rem; color: var(--text-soft); text-decoration: none; }
  .bottom-tabs .tab[aria-current="page"] { color: var(--link); }
}
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors (components are not mounted until Task 9).

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/shell apps/web/app/globals.css
git commit -m "feat(web): app and public shells, with sidebar, top bar and bottom tabs"
```

---

### Task 9: Route groups

**Files:**
- Move: `app/page.tsx` → `app/(public)/page.tsx`; `app/r` → `app/(public)/r`; `app/why` → `app/(public)/why`; `app/new` → `app/(app)/new`; `app/runs` → `app/(app)/runs`; `app/run` → `app/(app)/run`
- Create: `app/(public)/layout.tsx`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `AppShell`, `PublicShell` (Task 8); `WalletProvider` (Task 7); `Grid`, `Col` (Task 4).

- [ ] **Step 1: Move the routes**

```bash
cd apps/web/app
mkdir -p "(public)" "(app)"
git mv page.tsx "(public)/page.tsx"
git mv r "(public)/r"
git mv why "(public)/why"
git mv new "(app)/new"
git mv runs "(app)/runs"
git mv run "(app)/run"
cd ../../..
```

- [ ] **Step 2: The two group layouts**

```tsx
// apps/web/app/(public)/layout.tsx
import PublicShell from "@/components/shell/PublicShell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
```

```tsx
// apps/web/app/(app)/layout.tsx
import { Suspense } from "react";
import AppShell from "@/components/shell/AppShell";
import { WalletProvider } from "@/components/wallet/WalletProvider";

// useSearchParams (the ?n= network) inside the provider needs a boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <WalletProvider>
        <AppShell>{children}</AppShell>
      </WalletProvider>
    </Suspense>
  );
}
```

- [ ] **Step 3: The dashboard placeholder**

```tsx
// apps/web/app/(app)/dashboard/page.tsx
import Link from "next/link";
import { Grid, Col } from "@/components/grid/Grid";

export const metadata = { title: "Dashboard — Ledgerline" };

export default function DashboardPage() {
  return (
    <Grid>
      <Col span={8} md={12}>
        <section className="verdict">
          <h1>Your dashboard is coming next</h1>
          <p>
            For now, start a payout or open the runs you have sent from this browser.
          </p>
        </section>
        <p style={{ marginTop: 16, display: "flex", gap: 16 }}>
          <Link href="/new">Create a payout run</Link>
          <Link href="/runs">Runs you have sent</Link>
        </p>
      </Col>
    </Grid>
  );
}
```

- [ ] **Step 4: Verify every route still resolves**

Run: `npx tsc --noEmit && pnpm build`
Expected: build lists `/`, `/dashboard`, `/new`, `/r/[txHash]`, `/run/[txHash]`, `/runs`, `/why`.

Run `pnpm start --port 3055 &`, then:

```bash
for p in / /dashboard /new /runs /why "/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5" "/r/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?i=INV-EU-002"; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3055$p")" "$p"
done
curl -s http://localhost:3055/new | grep -c 'class="side-nav"'
curl -s "http://localhost:3055/r/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5" | grep -c 'class="side-nav"'
kill $(lsof -tiTCP:3055 -sTCP:LISTEN)
```

Expected: every route `200`; `/new` contains the side nav (`1`); `/r/…` does not (`0`).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/app
git commit -m "feat(web): put every route in its shell with route groups, URLs unchanged"
```

---

### Task 10: Move the pages' wallets onto the provider

**Files:**
- Modify: `apps/web/app/(app)/new/CreateRun.tsx` (wallet state, masthead, wrong-chain alert, reset logic, StepSend hold)
- Modify: `apps/web/app/(app)/new/page.tsx`
- Modify: `apps/web/app/(app)/runs/RunHistory.tsx`, `apps/web/app/(app)/runs/page.tsx`

**Interfaces:**
- Consumes: `useWallet()` (Task 7), `shouldResetPrepared` (Task 6).

- [ ] **Step 1: CreateRun reads the wallet from the provider**

In `CreateRun.tsx`:

1. Remove the imports of `connect, disconnect, switchChain, watchWallet, watchWalletList, knownWallets, EoaRequiredError, type ConnectedWallet, type WalletChoice` from `@/lib/wallet`, `WalletPicker`, `describeConnectError`/`ConnectError`, `describeError, errorCode`, and `networkFor`.
2. Add:

```ts
import { useRef } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { shouldResetPrepared } from "@/lib/wallet-session";
```

3. Change the signature to `export default function CreateRun()` and replace every piece of local wallet state (`wallet`, `walletError`, `sending`, `forgetQueued`, `choices`, `picking`, `switching`, `switchError`, `drop`, `forgetWallet`, the `forgetQueued` effect, `onChainChanged`, the `watchWallet` effect, `onSwitch`, the `watchWalletList` effect, `connectTo`, `onConnect`, `onDisconnect`) with:

```ts
  const { net, wallet, wrongChain, held, error: walletError, connect, setHold } = useWallet();

  // A prepared run belongs to one account on one chain; the provider tells us
  // when either changes. A confirmed run, or one being sent, is kept.
  const prevWallet = useRef(wallet);
  useEffect(() => {
    if (shouldResetPrepared(prevWallet.current, wallet, { confirmed: !!outcome, held })) {
      setPrepared(undefined);
      setStep((s) => Math.min(s, 1));
    }
    prevWallet.current = wallet;
  }, [wallet, outcome, held]);
```

4. Replace the `masthead` `<div>` (title + network + wallet links) with nothing — the top bar now carries title, network and wallet.
5. Replace the wrong-chain `<Alert>` (with its button) by one without a button:

```tsx
      {wrongChain && wallet && (
        <Alert
          style={{ marginTop: 22 }}
          type="warning"
          showIcon
          title={`This wallet is not on Arc ${net.name}`}
          description={`Ledgerline pays on Arc ${net.name}, chain ${net.chain.id}. Your wallet is on chain ${wallet.chainId || "an unreadable network"}. Use "Switch to Arc ${net.name}" at the top of the page — your wallet will ask you to confirm.`}
        />
      )}
```

6. In the JSX, pass `onConnect={connect}` to `StepPreview` and `onBusy={setHold}` to `StepSend`. Remove the `<WalletPicker … />` element at the end.
7. On phones the five-step bar becomes one line (spec §6.3). Replace the `<Steps … />` element with:

```tsx
      <Steps className="hide-sm" style={{ marginTop: 28 }} current={step} items={STEP_TITLES.map((title) => ({ title }))} />
      <p className="only-sm step-line">Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}</p>
```

and add above the component:

```ts
const STEP_TITLES = ["Upload", "Review", "Check", "Pay", "Receipts"];
```

and to `apps/web/app/globals.css`, inside the `@media (max-width: 639px)` block of Task 8:

```css
  .step-line { margin: 4px 0 0; color: var(--text-soft); font-size: 0.9rem; }
```

- [ ] **Step 2: The page no longer passes a network**

```tsx
// apps/web/app/(app)/new/page.tsx
import CreateRun from "./CreateRun";

export const metadata = { title: "New payout run — Ledgerline" };

export default function NewRunPage() {
  return <CreateRun />;
}
```

- [ ] **Step 3: RunHistory reads the wallet from the provider**

In `RunHistory.tsx`: remove `connect, knownWallets, watchWalletList, type ConnectedWallet, type WalletChoice`, `WalletPicker`, `describeError, errorCode`, `networkFor`, and the local `wallet`, `error`, `choices`, `picking`, `connectTo`, `onConnect` and discovery effect. Change the signature to `export default function RunHistory()` and use:

```ts
  const { net, wallet, connect } = useWallet();
  const [rows, setRows] = useState<RunRecord[]>([]);

  const refresh = useCallback(() => {
    setRows(wallet ? runsFor(wallet.address, net.chain.id) : []);
  }, [wallet, net.chain.id]);

  useEffect(() => { refresh(); }, [refresh]);
```

Replace `onConnect` with `connect` and `refresh(wallet)` calls with `refresh()`. Delete the page's own error `<Alert>` — the wallet button's toast reports connect failures now — and drop `error` from the destructuring. Remove the page's own masthead `<div>` and the `<WalletPicker … />` element. Add `import { useWallet } from "@/components/wallet/WalletProvider";`.

Update `apps/web/app/(app)/runs/page.tsx` to render `<RunHistory />` with no props.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run && pnpm build`
Expected: clean; all tests pass (including `plain-language.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/app/\(app\)
git commit -m "refactor(web): the create flow and run history use the shell's wallet"
```

---

### Task 11: Contrast and overflow sweep

**Files:**
- Modify: `apps/web/app/(public)/why/Why.tsx`, `apps/web/app/(app)/run/[txHash]/Reconciliation.tsx`, `apps/web/app/(app)/runs/RunHistory.tsx` (inline `opacity` on text)
- Modify: `apps/web/app/(app)/new/StepPreview.tsx`, `apps/web/app/(app)/new/Result.tsx`, `apps/web/app/(app)/run/[txHash]/Reconciliation.tsx`, `apps/web/app/(app)/runs/RunHistory.tsx` (tables, addresses)

- [ ] **Step 1: Find every faded-text style**

Run: `grep -rn "opacity: 0\.[0-9]" apps/web/app`
Expected: 11 hits across `Why.tsx`, `Reconciliation.tsx`, `RunHistory.tsx`.

- [ ] **Step 2: Replace each with the soft text colour**

For every hit on a text element, change `opacity: 0.45` / `0.5` / `0.6` to `color: "var(--text-soft)"` (keep any other properties in the same style object). Example, in `Reconciliation.tsx`:

```tsx
// before
<span style={{ opacity: 0.45 }}>{hasManifest ? "not on the list" : "in the run file"}</span>
// after
<span style={{ color: "var(--text-soft)" }}>{hasManifest ? "not on the list" : "in the run file"}</span>
```

Run: `grep -rn "opacity: 0\.[0-9]" apps/web/app`
Expected: no output.

- [ ] **Step 3: Keep shortened addresses on one line**

Change `className="hex"` to `className="hex addr"` on exactly these elements, each of which renders `short(…)` (line numbers are before this plan's moves; files now sit under `(app)` or `(public)`):

- `new/Result.tsx:100` — Recipient cell `<span>`
- `new/StepPreview.tsx:81` — Recipient `<a>`
- `run/[txHash]/Reconciliation.tsx:242` — Recipient `<a>`
- `run/[txHash]/Reconciliation.tsx:674` — payer `<span>` in link recovery
- `runs/RunHistory.tsx:118` — wallet `<span>` in the empty state
- `why/Why.tsx:211`, `why/Why.tsx:214` — payer `<span>`s
- `why/Why.tsx:313` — memo `<dt>`
- `why/Why.tsx:316` — recipient `<a>`
- `why/Why.tsx:339` — the approval transaction `<a>` (a shortened hash)

Run: `grep -rn 'className="hex addr"' apps/web/app | wc -l`
Expected: `10` (the WalletButton chip from Task 8 lives in `components/`, not `app/`).

- [ ] **Step 4: Tables scroll inside themselves**

Add `scroll={{ x: "max-content" }}` to the `<Table>` in `StepPreview.tsx`, `Result.tsx`, `Reconciliation.tsx` and `RunHistory.tsx`.

- [ ] **Step 5: Give the expand column a name**

In `Reconciliation.tsx`, inside the `expandable={{ … }}` prop, add `columnTitle: <span className="sr-only">Details</span>,`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run && pnpm build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/app
git commit -m "fix(web): soft text by colour not opacity, and tables that scroll in place"
```

---

### Task 12: Verify in a real browser

No new code unless a check fails; a failure is fixed in the task that owns the code, with a test where one can pin it, then this task is re-run.

**Files:** none (evidence only; screenshots stay in `.playwright-mcp/`, which is git-ignored).

- [ ] **Step 1: Build and serve**

Run: `pnpm build && pnpm start --port 3055 &` and wait for `curl -s -o /dev/null -w '%{http_code}' http://localhost:3055/` to print `200`.

- [ ] **Step 2: axe in both themes on all seven routes**

With the Playwright MCP, for `theme=dark` and `theme=light` (set as a cookie on `localhost` before navigating), visit `/`, `/dashboard`, `/new`, `/runs`, `/why`, `/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?n=testnet`, `/r/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5?i=INV-EU-002&n=testnet`. On each, inject axe (`page.addScriptTag({ path: ".playwright-mcp/axe.min.js" })`; download from `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js` if missing) and run `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })`.
Expected: no violation with impact `serious` or `critical` on any route in either theme. Record the table in the final report.

- [ ] **Step 3: No horizontal overflow**

At viewport widths 390, 768 and 1280, on every route: `document.documentElement.scrollWidth - document.documentElement.clientWidth`.
Expected: `0` everywhere.

- [ ] **Step 4: No theme flash**

```bash
curl -s -H 'Cookie: theme=light' http://localhost:3055/new | grep -o 'data-theme="[a-z]*"' | head -1
```

Expected: `data-theme="light"`.

- [ ] **Step 5: Keyboard**

On `/new` at 1280px, press Tab through the page and record each focused element and its computed outline.
Expected: skip link first; every sidebar item, the network badge's neighbours, the wallet button and page controls show a visible outline. At 390px, the bottom tabs and the "⋯" menu are reachable and visibly focused.

- [ ] **Step 6: The money flow, end to end, on testnet**

Run a local signer that holds `PRIVATE_KEY` from the repo `.env` in its own Node process, answering only `eth_requestAccounts`, `eth_accounts`, `personal_sign` and `eth_sendTransaction`, with `Access-Control-Allow-Origin: http://localhost:3055` (never `*` — any open site could otherwise ask it to sign). Inject an EIP-6963 provider that forwards those methods to it. Then: `/new` → name `shell-check <ISO time>` → upload the two-line sample (0.1 USDC, 0.1 EURC to `0xe48A096B9E74f064b13c17734af29F85E02d732a`) → Connect wallet from the top bar → Check → Sign and check → Sign and send → Sign and pay.
While the send is in progress, open the wallet menu.
Expected: "Disconnect (after this payment settles)" is disabled; the run confirms; one receipt link opens as **Verified** with five ✓. Stop the signer afterwards.

- [ ] **Step 7: Old URLs**

Expected (already checked in Task 9 Step 4, re-run here): all seven routes `200`; `/new`, `/runs`, `/run/…`, `/dashboard` have the side nav; `/`, `/r/…`, `/why` do not.

- [ ] **Step 8: Full suite and final commit**

Run from the repo root: `pnpm test && pnpm typecheck`
Expected: every package passes; typecheck clean.

Stop the server: `kill $(lsof -tiTCP:3055 -sTCP:LISTEN)`.
If any fix was needed during this task, commit it with a message naming the check that caught it.
