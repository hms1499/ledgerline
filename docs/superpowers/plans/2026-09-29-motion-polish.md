# Motion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pages that arrive, blocks that enter in reading order, buttons that lift under the pointer, and counts that count up — within the tape's rules — plus in-page Connect buttons that show the wallet is connecting.

**Architecture:** Pure CSS for every motion: a `page-in` keyframe played by a `template.tsx` wrapper in each route group (the receipt excluded by a pure `pageMotion(pathname)`), stagger through `nth-child` delays, a hover lift in the button section of `antd.css`, and a `step-in` wrapper keyed by New's step. One client component, `CountUp`, over a pure `countAt` function. The recorders wait on one page expression, `STILL`, before logging what the camera sees.

**Tech Stack:** Next.js 16.3.5 App Router (`template.tsx`), React 19.3 (`useSyncExternalStore`), antd 6.6.5 (`ant-btn-variant-*`), vitest 2 (node environment: pure functions and source checks), Playwright 1.62.1 (root devDependency) with `.playwright-mcp/axe.min.js`.

**Spec:** `docs/superpowers/specs/2026-09-29-motion-polish-design.md`. Parents it amends: `docs/superpowers/specs/2026-09-24-tape-design-system-design.md` §8, `docs/superpowers/specs/2026-09-28-home-polish-design.md` §4.

## Global Constraints

- No new dependency; `package.json` and `pnpm-lock.yaml` do not change.
- CSS keyframes and one hook (`CountUp`); the hook's arithmetic is a pure function with its own tests.
- Durations: 150 ms (hover), 350 ms (page-in), 80 ms steps capped at 400 ms (stagger), 800 ms (count-up). Nothing longer.
- Page-in: opacity 0 → 1 while rising 12px, ease-out, `animation-fill-mode: backwards`; only `opacity` and `transform` animate.
- Page-in and stagger on Dashboard, Runs, Run (`/run/…`), New, Home, Compare (`/why`) — **not `/r`**.
- Hover lift: primary and default buttons (antd solid and outlined, and `.button-primary`) rise 1px with `0 3px 8px -4px rgb(0 0 0 / 0.35)`; pressed, 1px below rest with no shadow; disabled or loading never lift; only under `@media (hover: hover)`.
- No amount is rolled: a token amount, a balance, a fee, a block number and anything on a receipt is printed as it is. Counts that count: New's "N paid" and the Run page's Payments figure — nothing else.
- Every new motion is static under `prefers-reduced-motion: reduce`; each is written inside `@media (prefers-reduced-motion: no-preference)`.
- Radius stays 0 everywhere; the focus ring stays `2px solid var(--focus)`, offset 2. Both themes; no colour is added.
- Work in a worktree from local HEAD (`git worktree add .claude/worktrees/motion-polish -b feat/motion-polish HEAD`), copy `frontend/.env.local` in. Commit after each task; never push. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A client-side navigation** (a sidebar link, Back): the new page arrives and no block is left faint — Task 8, "navigation".
2. **A button that turns loading while the pointer is over it** (Connect): it drops back to rest with no shadow — Task 8, "a loading button under the pointer sits at rest".
3. **A count whose value changes, or that counts down**: whole numbers, never past the new value, landing on it — Task 4, "counts down to a smaller value without passing it" and "a new roll starts from the old value".
4. **A long page** (Home, a Run with many blocks): every block has started by 400 ms, so the page is in by 750 ms — Task 1, "staggers 80 ms a step" and Task 8, "the last block starts by 400 ms".
5. **JavaScript slow or blocked**: the page is never blank and nothing stays faint — Task 1, "fills backwards only" and Task 8, "no JS".

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/motion.ts` | create | `pageMotion(pathname)`: which pages arrive |
| `frontend/app/(app)/template.tsx` | create | Wraps each app page in `.page-in` |
| `frontend/app/(public)/template.tsx` | create | Wraps each public page in `.page-in`, except `/r` |
| `frontend/app/styles/shell.css` | modify | `page-in` keyframes, stagger delays, `.step-in` |
| `frontend/app/(app)/new/CreateRun.tsx` | modify | Step content in a `step-in` wrapper keyed by step; `connecting` to StepPreview |
| `frontend/app/styles/antd.css` | modify | The hover lift |
| `frontend/lib/count-up.ts` | create | `countAt`, `firstShown`, `easeOutCubic`, `COUNT_MS` |
| `frontend/components/ui/CountUp.tsx` | create | The rolling figure, `aria-hidden`, with an `sr-only` value |
| `frontend/app/styles/base.css` | modify | `.count-up` |
| `frontend/lib/run-view.ts` | modify | `StatView.count` on Payments |
| `frontend/app/(app)/run/[txHash]/Reconciliation.tsx` | modify | Payments figure counts |
| `frontend/app/(app)/new/Result.tsx` | modify | "N paid" counts |
| `frontend/app/(app)/dashboard/Dashboard.tsx` | modify | Connect shows `connecting` |
| `frontend/app/(app)/runs/RunHistory.tsx` | modify | Connect shows `connecting` |
| `frontend/app/(app)/new/StepPreview.tsx` | modify | Connect shows `connecting` |
| `frontend/test/motion.test.ts` | create | `pageMotion`, the CSS rules, the step wrapper, where counts roll |
| `frontend/test/count-up.test.ts` | create | The count's arithmetic |
| `frontend/test/connect-buttons.test.ts` | create | Every in-page Connect button shows `connecting` |
| `frontend/test/run-view.test.ts` | modify | `count` on Payments only |
| `scripts/lib/still.ts` | create | `STILL`, `waitForStill` |
| `scripts/lib/still.test.ts` | create | `STILL` against a stand-in document |
| `scripts/lib/take-recorder.ts` | modify | `settle()` waits for stillness |
| `scripts/record-demo.ts` | modify | The poster waits for stillness |
| `docs/superpowers/specs/2026-09-29-motion-polish-design.md` | modify (Task 8) | §8 unknowns, answered |

---

### Task 1: Pages arrive, their blocks in reading order

**Files:**
- Create: `frontend/lib/motion.ts`, `frontend/app/(app)/template.tsx`, `frontend/app/(public)/template.tsx`, `frontend/test/motion.test.ts`
- Modify: `frontend/app/styles/shell.css` (append)

**Interfaces:**
- Produces: `pageMotion(pathname: string): boolean`; the `.page-in` class on each template's wrapper; `@keyframes page-in`; in `motion.test.ts` the helpers `blocks(text)`, `allCss()`, `css(name)`, `source(path)`, `preludesUsing(re)` that Tasks 2, 3 and 5 extend.

- [ ] **Step 1: Write the failing test** — `frontend/test/motion.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/motion"`.

- [ ] **Step 3: Create `frontend/lib/motion.ts`**

```ts
/**
 * Which pages arrive with page-in and stagger (spec 2026-09-29 §2.1): every
 * page but the receipt, whose checks print in one after another because they
 * ran one after another — a fade over the whole page would put a moment
 * before the verdict where nothing is legible.
 */
export const pageMotion = (pathname: string): boolean => !/^\/r(\/|$)/.test(pathname);
```

- [ ] **Step 4: Create `frontend/app/(app)/template.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { pageMotion } from "@/lib/motion";

/**
 * A template, not a layout: Next mounts a new one for each page, so every
 * navigation plays page-in (spec 2026-09-29 §2.1). A change of search
 * parameters alone (the ?n= network) does not remount it.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  if (!pageMotion(usePathname())) return children;
  return <div className="page-in">{children}</div>;
}
```

- [ ] **Step 5: Create `frontend/app/(public)/template.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { pageMotion } from "@/lib/motion";

/**
 * Every public page arrives with page-in, except the receipt: `/r` keeps only
 * its print-in (spec 2026-09-29 §2.1), and its markup stays as it was.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  if (!pageMotion(usePathname())) return children;
  return <div className="page-in">{children}</div>;
}
```

- [ ] **Step 6: Append to `frontend/app/styles/shell.css`**

```css

/* ── a page arrives (spec 2026-09-29 §2.1–2.2): its blocks in reading order,
   80 ms apart, every one started by 400 ms. Backwards only: a browser that
   skips the animation shows the page, and nothing is left transformed. ─── */
@media (prefers-reduced-motion: no-preference) {
  .page-in > .grid > .col, .page-in > :not(.grid) { animation: page-in 350ms ease-out backwards; }
  .page-in > .grid > .col:nth-child(2) { animation-delay: 80ms; }
  .page-in > .grid > .col:nth-child(3) { animation-delay: 160ms; }
  .page-in > .grid > .col:nth-child(4) { animation-delay: 240ms; }
  .page-in > .grid > .col:nth-child(5) { animation-delay: 320ms; }
  .page-in > .grid > .col:nth-child(n + 6) { animation-delay: 400ms; }
}
@keyframes page-in { from { opacity: 0; transform: translateY(12px); } }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Typecheck and run the frontend suite**

Run: `cd frontend && pnpm typecheck && pnpm exec vitest run`
Expected: typecheck exit 0; every frontend test passes.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/motion.ts "frontend/app/(app)/template.tsx" "frontend/app/(public)/template.tsx" frontend/app/styles/shell.css frontend/test/motion.test.ts
git commit -m "feat(web): pages arrive, their blocks in reading order

A template in each route group wraps the page in .page-in: its columns
fade in while rising 12px over 350 ms, 80 ms apart, every one started by
400 ms. CSS only and backwards-filling, so the page is never blank before
hydration. The receipt keeps only its print-in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New's steps enter

**Files:**
- Modify: `frontend/app/(app)/new/CreateRun.tsx:55` (state) and `:180-248` (the Tape's children), `frontend/app/styles/shell.css` (the Task 1 media block), `frontend/test/motion.test.ts` (append)

**Interfaces:**
- Consumes: `@keyframes page-in` and the media block from Task 1; `source`, `css` from `motion.test.ts`.
- Produces: `.step-in`.

- [ ] **Step 1: Append the failing test to `frontend/test/motion.test.ts`**

```ts
describe("New's steps enter (spec §2.1)", () => {
  it("each step after the first remounts in a step-in wrapper; the step the page opened on arrives with the page", () => {
    const text = source("app/(app)/new/CreateRun.tsx");
    expect(text).toMatch(/const \[openedOn\] = useState\(step\);/);
    expect(text).toMatch(/if \(!stepMoved && step !== openedOn\) setStepMoved\(true\);/);
    expect(text).toMatch(/<div key=\{step\} className=\{stepMoved \? "step-in" : undefined\}>/);
  });

  it("plays like page-in, where motion is allowed", () => {
    expect(css("shell.css")).toMatch(/\.step-in\s*\{\s*animation:\s*page-in 350ms ease-out backwards;\s*\}/);
    for (const p of preludesUsing(/\.step-in\s*\{/)) expect(p).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts`
Expected: FAIL — the two new tests; the six from Task 1 pass.

- [ ] **Step 3: Add the step state in `CreateRun.tsx`**, directly under `const [step, setStep] = useState(0);`:

```tsx
  // The step the page opened on arrives with the page (page-in); every step
  // after it enters on its own (spec 2026-09-29 §2.1). Set during render, so
  // the new step's first frame already carries the class.
  const [openedOn] = useState(step);
  const [stepMoved, setStepMoved] = useState(false);
  if (!stepMoved && step !== openedOn) setStepMoved(true);
```

- [ ] **Step 4: Wrap the step content.** Two insertions inside the `<Tape state={step === 4 ? "torn" : "feeding"} …>` element, nothing else changes:

1. Directly after the Tape's opening tag, before `{step === 0 && (`, insert:

```tsx
          <div key={step} className={stepMoved ? "step-in" : undefined}>
```

2. Directly before `</Tape>`, after the closing `)}` of the `{step === 4 && outcome && prepared && draft && (` block, insert:

```tsx
          </div>
```

Re-indent the five `{step === N && …}` blocks by two spaces so they read as the wrapper's children.

- [ ] **Step 5: Add `.step-in` to the Task 1 media block in `shell.css`**, after the `n + 6` line:

```css
  .step-in { animation: page-in 350ms ease-out backwards; }
```

- [ ] **Step 6: Check nothing styled the step as the Tape's direct child**

Run: `grep -n "\.tape > \|tape-title + \|\.tape > \*" frontend/app/styles/*.css`
Expected: no rule that targets a step component as a direct child of `.tape` (the step now sits one `div` deeper). If one appears, add `.step-in` to its path and note it in the commit message.

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts && pnpm typecheck`
Expected: PASS, 8 tests; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add "frontend/app/(app)/new/CreateRun.tsx" frontend/app/styles/shell.css frontend/test/motion.test.ts
git commit -m "feat(web): each step of a new run enters like a page

The step content sits in a wrapper keyed by the step, so a step change
remounts it with .step-in. The step the page opened on carries no class:
it arrives with the page, and a second fade would double it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Buttons lift under the pointer

**Files:**
- Modify: `frontend/app/styles/antd.css` (after the `.ant-btn:not(:disabled):active` media block, line 29), `frontend/test/motion.test.ts` (append)

**Interfaces:**
- Consumes: `blocks`, `allCss` from `motion.test.ts`.

- [ ] **Step 1: Append the failing test to `frontend/test/motion.test.ts`**

```ts
describe("buttons lift (spec §2.3)", () => {
  const lifts = () => blocks(allCss()).filter(([, body]) => /translateY\(-1px\)/.test(body));
  const body = () => lifts().map(([, b]) => b).join("\n");

  it("only where motion is allowed and the pointer can hover", () => {
    expect(lifts().length).toBeGreaterThan(0);
    for (const [p] of lifts()) {
      expect(p).toMatch(/prefers-reduced-motion:\s*no-preference/);
      expect(p).toMatch(/\(hover:\s*hover\)/);
    }
  });

  it("lifts solid and outlined buttons and .button-primary — never a disabled, loading, text or link one", () => {
    expect(body()).toMatch(/:is\(\.ant-btn-variant-solid, \.ant-btn-variant-outlined\):not\(:disabled, \.ant-btn-disabled, \.ant-btn-loading\):hover/);
    expect(body()).toMatch(/\.button-primary:hover/);
    expect(body()).not.toMatch(/variant-(link|text)/);
  });

  it("rises over 150 ms with the one shadow that is not a popup's, and presses 1px below rest", () => {
    expect(body()).toMatch(/transition-duration:\s*150ms/);
    expect(body()).toMatch(/transition-timing-function:\s*ease-out/);
    expect(body()).toMatch(/box-shadow:\s*0 3px 8px -4px rgb\(0 0 0 \/ 0\.35\)/);
    expect(body()).toMatch(/\.button-primary:active\s*\{\s*transform:\s*translateY\(1px\);\s*box-shadow:\s*none;\s*\}/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts`
Expected: FAIL — the three new tests (`lifts().length` is 0).

- [ ] **Step 3: Add the lift to `frontend/app/styles/antd.css`**, right after the existing block

```css
@media (prefers-reduced-motion: no-preference) {
  .ant-btn:not(:disabled):active { transform: translateY(1px); }
}
```

insert:

```css
/* Motion polish §2.3: under a hovering pointer a button rises 1px and casts
   the one shadow that is not a popup's; pressed, it drops below rest again.
   Text and link buttons stay flat: they read as words, not keys. A disabled
   or loading button does not rise, and a touch screen never sees a stuck lift. */
@media (prefers-reduced-motion: no-preference) and (hover: hover) {
  :is(.ant-btn-variant-solid, .ant-btn-variant-outlined):not(:disabled, .ant-btn-disabled, .ant-btn-loading),
  .button-primary {
    transition-property: color, background-color, border-color, transform, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }
  :is(.ant-btn-variant-solid, .ant-btn-variant-outlined):not(:disabled, .ant-btn-disabled, .ant-btn-loading):hover,
  .button-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px -4px rgb(0 0 0 / 0.35);
  }
  :is(.ant-btn-variant-solid, .ant-btn-variant-outlined):not(:disabled, .ant-btn-disabled, .ant-btn-loading):active,
  .button-primary:active {
    transform: translateY(1px);
    box-shadow: none;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && pnpm exec vitest run test/motion.test.ts test/no-legacy-css.test.ts`
Expected: PASS — 11 motion tests; the radius and focus-ring guards still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/styles/antd.css frontend/test/motion.test.ts
git commit -m "feat(web): a button rises 1px under the pointer and presses below rest

Solid and outlined buttons and .button-primary lift with a thin paper
shadow over 150 ms, only for a hovering pointer and only where motion is
allowed. Disabled, loading, text and link buttons stay flat.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A count that counts

**Files:**
- Create: `frontend/lib/count-up.ts`, `frontend/components/ui/CountUp.tsx`, `frontend/test/count-up.test.ts`
- Modify: `frontend/app/styles/base.css` (after the `.sr-only` rule)

**Interfaces:**
- Produces: `COUNT_MS = 800`; `easeOutCubic(u: number): number`; `countAt(from: number, to: number, elapsed: number, duration?: number): number`; `firstShown(value: number, hydrating: boolean, reduced: boolean): number`; default export `CountUp({ value }: { value: number })`, rendering `<span class="count-up" aria-hidden="true" data-counting?>` and `<span class="sr-only">`.

- [ ] **Step 1: Write the failing test** — `frontend/test/count-up.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { COUNT_MS, countAt, easeOutCubic, firstShown } from "@/lib/count-up";

const roll = (from: number, to: number) => Array.from({ length: 81 }, (_, i) => countAt(from, to, i * 10));

describe("countAt — what a rolling count shows (spec 2026-09-29 §2.4)", () => {
  it("starts where it was and lands exactly on the value, then stays there", () => {
    expect(countAt(0, 12, 0)).toBe(0);
    expect(countAt(0, 12, COUNT_MS)).toBe(12);
    expect(countAt(0, 12, COUNT_MS * 3)).toBe(12);
  });

  it("shows whole numbers that never go back and never pass the value", () => {
    const seen = roll(0, 7);
    expect(seen.every(Number.isInteger)).toBe(true);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]!)).toBe(true);
    expect(Math.max(...seen)).toBe(7);
  });

  it("reaches the value only at the end", () => {
    expect(countAt(0, 1, COUNT_MS - 1)).toBe(0);
    expect(countAt(0, 7, COUNT_MS - 10)).toBe(6);
  });

  it("counts down to a smaller value without passing it", () => {
    const seen = roll(9, 4);
    expect(seen[0]).toBe(9);
    expect(seen.at(-1)).toBe(4);
    expect(seen.every((v, i) => i === 0 || v <= seen[i - 1]!)).toBe(true);
    expect(Math.min(...seen)).toBe(4);
  });

  it("a new roll starts from the old value", () => {
    expect(countAt(3, 5, 0)).toBe(3);
    expect(countAt(3, 5, COUNT_MS)).toBe(5);
  });

  it("eases out: most of the way in the first half", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(countAt(0, 100, COUNT_MS / 2)).toBe(87);
  });
});

describe("firstShown — a count's first frame", () => {
  it("is the value when the count is already in the server's HTML, or motion is reduced", () => {
    expect(firstShown(4, true, false)).toBe(4);
    expect(firstShown(4, false, true)).toBe(4);
  });

  it("is 0 when the count appears on the client and will count up", () => {
    expect(firstShown(4, false, false)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm exec vitest run test/count-up.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/count-up"`.

- [ ] **Step 3: Create `frontend/lib/count-up.ts`**

```ts
/**
 * The arithmetic of a count that counts (spec 2026-09-29 §2.4), apart from
 * React so it can be tested: whole numbers, eased out, never past the value,
 * and exactly the value at the end. Counts only — never an amount.
 */
export const COUNT_MS = 800;

export const easeOutCubic = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

/** What a count rolling from `from` to `to` shows `elapsed` ms in. */
export function countAt(from: number, to: number, elapsed: number, duration = COUNT_MS): number {
  if (elapsed >= duration) return to;
  const v = from + (to - from) * easeOutCubic(elapsed / duration);
  return to >= from ? Math.min(to, Math.floor(v)) : Math.max(to, Math.ceil(v));
}

/** What a count shows on its first render: its value when it is already in
 *  the server's HTML or motion is reduced; 0 when it appears on the client
 *  and will count up. */
export const firstShown = (value: number, hydrating: boolean, reduced: boolean): number =>
  hydrating || reduced ? value : 0;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm exec vitest run test/count-up.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Create `frontend/components/ui/CountUp.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { COUNT_MS, countAt, firstShown } from "@/lib/count-up";

const noChange = () => () => {};
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A count that counts (spec 2026-09-29 §2.4). It rolls in whole numbers from
 * 0 when it first appears on the client, and from its old value when the
 * value changes, landing exactly on `value`. A count already in the server's
 * HTML shows its value and does not roll on hydration. Screen readers get the
 * value once, from a visually hidden copy; the rolling figure is hidden from
 * them. While it rolls it carries `data-counting`, which the recorders wait
 * on. Never give it an amount: a token amount is printed, not rolled.
 *
 * Under React's development StrictMode the effect runs twice and the second
 * run lands at once; `next start` rolls.
 */
export default function CountUp({ value }: { value: number }) {
  // React reads the server snapshot while hydrating; a client-only mount reads false.
  const hydrating = useSyncExternalStore(noChange, () => false, () => true);
  const [shown, setShown] = useState(() => firstShown(value, hydrating, reducedMotion()));
  const from = useRef<number | null>(hydrating ? value : null);

  useEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || reducedMotion()) { setShown(value); return; }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setShown(countAt(start, value, now - t0));
      if (now - t0 < COUNT_MS) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span
        className="count-up" aria-hidden="true" data-counting={shown === value ? undefined : ""}
        style={{ minWidth: `${String(value).length}ch` }}
      >
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
```

- [ ] **Step 6: Add `.count-up` to `frontend/app/styles/base.css`**, right after the `.sr-only { … }` rule:

```css
/* A count that counts (motion polish §2.4): it holds the width of its final
   figure, so what follows it never shifts while it rolls. */
.count-up { display: inline-block; text-align: right; }
```

- [ ] **Step 7: Typecheck and run the frontend suite**

Run: `cd frontend && pnpm typecheck && pnpm exec vitest run`
Expected: typecheck exit 0; every frontend test passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/count-up.ts frontend/components/ui/CountUp.tsx frontend/test/count-up.test.ts frontend/app/styles/base.css
git commit -m "feat(web): a count that counts up in whole numbers and lands on its value

countAt eases out over 800 ms, never passes the value and reaches it only
at the end; CountUp rolls it on the client, shows the value at once under
reduced motion or when it was server-rendered, hides the rolling figure
from screen readers and marks itself data-counting while it moves.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The two counts count

**Files:**
- Modify: `frontend/lib/run-view.ts` (`StatView`, and the `payments` entry at line 107), `frontend/app/(app)/run/[txHash]/Reconciliation.tsx` (imports at line 26; `StatTile` at line 267-268), `frontend/app/(app)/new/Result.tsx` (imports after line 15; line 122), `frontend/test/run-view.test.ts`, `frontend/test/motion.test.ts`

**Interfaces:**
- Consumes: `CountUp` from Task 4.
- Produces: `StatView.count?: number`, set on Payments only.

- [ ] **Step 1: Add the failing tests**

In `frontend/test/run-view.test.ts`, inside `describe("runStatsView — the run page's four tiles", …)`, after the "Payments: a token without metadata" test:

```ts
  it("Payments: carries the count as a number, the only tile that counts up", () => {
    expect(stats()[0]).toMatchObject({ value: "3", count: 3 });
    expect(stats().slice(1).map((s) => s.count)).toEqual([undefined, undefined, undefined]);
  });
```

Append to `frontend/test/motion.test.ts` (and add `join`, `relative` to its imports: `import { join, relative } from "node:path";`):

```ts
describe("counts that count (spec §2.4)", () => {
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const tsx = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? tsx(join(dir, d.name)) : d.name.endsWith(".tsx") ? [join(dir, d.name)] : []);

  it("only New's paid count and the Run page's Payments figure — never an amount", () => {
    const uses = ["app", "components"].flatMap((d) => tsx(join(ROOT, d))).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<CountUp value=\{([^}]+)\} \/>/g)].map((m) => `${relative(ROOT, f)}: ${m[1]}`));
    expect(uses.sort()).toEqual([
      "app/(app)/new/Result.tsx: rows.length",
      "app/(app)/run/[txHash]/Reconciliation.tsx: s.count",
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm exec vitest run test/run-view.test.ts test/motion.test.ts`
Expected: FAIL — "carries the count" (`count` is undefined) and "only New's paid count…" (the list is empty).

- [ ] **Step 3: Add `count` to `frontend/lib/run-view.ts`**

In `interface StatView`, after `value: string;`:

```ts
  /** A whole count, for a figure that counts up (spec 2026-09-29 §2.4). Only
   *  Payments has one: every other tile is a word, an amount or a block. */
  count?: number;
```

In `runStatsView`, the payments entry becomes:

```ts
    {
      key: "payments", label: STAT_LABELS[0], value: String(payments.length), count: payments.length,
      sub: totals.map(({ token, total }) => amountText(total, token, meta.get(token.toLowerCase()) ?? {})),
    },
```

- [ ] **Step 4: Roll the Payments figure in `Reconciliation.tsx`**

Add after `import StatTile from "@/components/ui/StatTile";`:

```tsx
import CountUp from "@/components/ui/CountUp";
```

In the stats map, the `StatTile`'s `value` becomes:

```tsx
          <StatTile
            label={s.label} tone={s.tone} value={s.count === undefined ? s.value : <CountUp value={s.count} />}
```

- [ ] **Step 5: Roll the paid count in `Result.tsx`**

Add after `import { correctedFile } from "@/lib/corrected-file";`:

```tsx
import CountUp from "@/components/ui/CountUp";
```

and the summary line becomes:

```tsx
          <p className="amount">
            <CountUp value={rows.length} /><span className="unit">paid</span>
          </p>
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd frontend && pnpm exec vitest run && pnpm typecheck`
Expected: every frontend test passes, including the two new ones; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/run-view.ts "frontend/app/(app)/run/[txHash]/Reconciliation.tsx" "frontend/app/(app)/new/Result.tsx" frontend/test/run-view.test.ts frontend/test/motion.test.ts
git commit -m "feat(web): the run's payment count and the paid count count up

The two standalone counts roll; every amount, balance and block stays
printed. A test lists every CountUp in the app, so a third use has to be
argued for.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Connect buttons say the wallet is connecting

**Files:**
- Modify: `frontend/app/(app)/dashboard/Dashboard.tsx:36,112`, `frontend/app/(app)/runs/RunHistory.tsx:17,68`, `frontend/app/(app)/new/CreateRun.tsx:94` and the `<StepPreview …>` props, `frontend/app/(app)/new/StepPreview.tsx:48,54,372`
- Create: `frontend/test/connect-buttons.test.ts`

**Interfaces:**
- Consumes: `useWallet().connecting: boolean` (exists in `components/wallet/WalletProvider.tsx`).
- Produces: `StepPreview` prop `connecting?: boolean`.

- [ ] **Step 1: Write the failing test** — `frontend/test/connect-buttons.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../app/${path}`, import.meta.url)), "utf8");

describe("in-page Connect buttons (motion polish §3)", () => {
  it("every one shows the wallet is connecting, as the top bar's does", () => {
    // While a wallet's prompt is open these stayed clickable and said nothing.
    for (const f of ["(app)/dashboard/Dashboard.tsx", "(app)/runs/RunHistory.tsx", "(app)/new/StepPreview.tsx"]) {
      const buttons = [...source(f).matchAll(/<Button\b[^>]*>\s*Connect a wallet[^<]*<\/Button>/g)].map((m) => m[0]);
      expect(buttons.length, f).toBeGreaterThan(0);
      for (const b of buttons) expect(b, f).toMatch(/loading=\{connecting\}/);
    }
  });

  it("the Review step is handed the wallet's connecting state", () => {
    expect(source("(app)/new/CreateRun.tsx")).toMatch(/connecting=\{connecting\}/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm exec vitest run test/connect-buttons.test.ts`
Expected: FAIL — both tests.

- [ ] **Step 3: Dashboard.** Line 36 becomes

```tsx
  const { net, wallet, connect, connecting, wrongChain, switching, switchToArc } = useWallet();
```

and line 112 becomes

```tsx
            <Button type="primary" style={{ marginTop: 20 }} loading={connecting} onClick={connect}>Connect a wallet</Button>
```

- [ ] **Step 4: RunHistory.** Line 17 becomes

```tsx
  const { net, wallet, connect, connecting } = useWallet();
```

and line 68 becomes

```tsx
            <Button type="primary" style={{ marginTop: 24 }} loading={connecting} onClick={connect}>Connect a wallet</Button>
```

- [ ] **Step 5: CreateRun.** Line 94 becomes

```tsx
  const { net, wallet, wrongChain, held, error: walletError, switchError, connect, connecting, setHold } = useWallet();
```

and in the `<StepPreview …>` props, `wallet={wallet} walletError={walletError} onConnect={connect}` becomes

```tsx
              wallet={wallet} walletError={walletError} onConnect={connect} connecting={connecting}
```

- [ ] **Step 6: StepPreview.** Add `connecting` to the destructured props on line 48 (after `onConnect,`) and to the props type on line 54:

```tsx
  wallet?: ConnectedWallet; walletError?: ConnectError; onConnect: () => void; connecting?: boolean;
```

and line 372 becomes

```tsx
          <Button type="primary" loading={connecting} onClick={onConnect}>Connect a wallet to continue</Button>
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd frontend && pnpm exec vitest run && pnpm typecheck`
Expected: every frontend test passes; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add "frontend/app/(app)/dashboard/Dashboard.tsx" "frontend/app/(app)/runs/RunHistory.tsx" "frontend/app/(app)/new/CreateRun.tsx" "frontend/app/(app)/new/StepPreview.tsx" frontend/test/connect-buttons.test.ts
git commit -m "fix(web): in-page Connect buttons say the wallet is connecting

Dashboard, Runs and the Review step ignored WalletProvider's connecting:
with a wallet's prompt open they stayed clickable and said nothing. They
show loading, as the top bar's Connect already did.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The recorders wait for the page to be still

**Files:**
- Create: `scripts/lib/still.ts`, `scripts/lib/still.test.ts`
- Modify: `scripts/lib/take-recorder.ts` (imports; `settle()`), `scripts/record-demo.ts` (imports at line 37; the poster mark at line 221)

**Interfaces:**
- Consumes: `data-counting` from Task 4.
- Produces: `STILL: string` (a page expression); `waitForStill(page: Page, timeout?: number): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `scripts/lib/still.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { STILL } from "./still.js";

/** Runs STILL against a stand-in document. */
function still(animations: [playState: string, iterations: number][], counting = false): boolean {
  const document = {
    getAnimations: () => animations.map(([playState, iterations]) =>
      ({ playState, effect: { getComputedTiming: () => ({ iterations }) } })),
    querySelector: (s: string) => (s === "[data-counting]" && counting ? {} : null),
  };
  return new Function("document", `return ${STILL};`)(document) as boolean;
}

describe("STILL — nothing moving that a viewer waits for", () => {
  it("is still when nothing runs, or what ran has finished", () => {
    expect(still([])).toBe(true);
    expect(still([["finished", 1]])).toBe(true);
  });

  it("waits for a finite animation that is running: a page arriving, a block staggering in", () => {
    expect(still([["running", 1]])).toBe(false);
  });

  it("never waits for an infinite one: the feed line, a skeleton, the heartbeat", () => {
    expect(still([["running", Infinity]])).toBe(true);
  });

  it("waits for a count that is rolling", () => {
    expect(still([], true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --dir scripts scripts/lib/still.test.ts`
Expected: FAIL — `Failed to load url ./still.js`.

- [ ] **Step 3: Create `scripts/lib/still.ts`**

```ts
import type { Page } from "playwright";

/**
 * True in the page when nothing a viewer waits for is moving: no finite
 * animation or transition running (page-in, stagger, print-in, a button's
 * lift) and no count rolling (`data-counting`, motion polish §2.4). Infinite
 * ones — the feed line, a skeleton, the recorder's heartbeat — never end and
 * are not waited on. An expression, so waitForFunction can run it as it is.
 */
export const STILL =
  `document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity)`
  + ` && !document.querySelector("[data-counting]")`;

export async function waitForStill(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(STILL, undefined, { timeout });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --dir scripts scripts/lib/still.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The walkthrough's `settle()` waits for stillness.** In `scripts/lib/take-recorder.ts`, add after `import { CAPTIONS, type CaptionKey } from "./walkthrough.js";`:

```ts
import { waitForStill } from "./still.js";
```

and replace `settle()` with:

```ts
  /** Waits for smooth scrolling to stop, then for page-in, stagger and any
   *  count to finish, so the box logged is the box shown: a block still
   *  rising would be logged 12px low. */
  private async settle() {
    let last = await this.page.evaluate(() => window.scrollY);
    for (let i = 0; i < 20; i++) {
      await pause(100);
      const y = await this.page.evaluate(() => window.scrollY);
      if (y === last) break;
      last = y;
    }
    await waitForStill(this.page);
  }
```

- [ ] **Step 6: The home demo's poster waits for stillness.** In `scripts/record-demo.ts`, add after `import { startCapture, type Frame } from "./lib/screencast.js";`:

```ts
import { waitForStill } from "./lib/still.js";
```

and, directly above `marks.push({ label: "poster", at: Date.now() / 1000 });`, add:

```ts
  await waitForStill(page);
```

- [ ] **Step 7: Run the scripts suite**

Run: `pnpm exec vitest run --dir scripts`
Expected: PASS, 65 tests (61 before plus 4).

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/still.ts scripts/lib/still.test.ts scripts/lib/take-recorder.ts scripts/record-demo.ts
git commit -m "feat(scripts): the recorders wait for the page to be still

A focus logged while a block is still rising would be framed 12px low,
and a poster taken mid-fade would be faint. STILL waits for every finite
animation and any rolling count, never for the feed line or a skeleton.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: In a real browser, and the spec's unknowns answered

**Files:**
- Create (then delete): `.verify-motion.mjs` at the repo root
- Modify: `docs/superpowers/specs/2026-09-29-motion-polish-design.md` (§8)

- [ ] **Step 1: Build and serve**

```bash
pnpm build
(cd frontend && pnpm exec next start -p 3100) &
```

Expected: build exit 0; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/` prints `200`.

- [ ] **Step 2: Write `.verify-motion.mjs` at the repo root**

```js
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const AXE = ".playwright-mcp/axe.min.js";
const RUN = "/run/0x79720a20c9ee448efb52903deadabcf4fd6eb70263efbcdf0db0ed0d06839cbb?n=mainnet";
const RECEIPT = "/r/0x56e067011c4208b0d80bb9b2fd1ad0cd0af5a8aea39bf342a15e24bf7c50a7f7?i=INV-US-001&s=0xd59190857dfbdf14a837ca8b1b79918fbb7cdbfdda605da3a2ab29ee0e3d7e5d&p=u02XKki1yNt2gWg7DjZuaAIcf8mb_N0M2Y5D160bTPqMYatQVc8vmtsbNT877iINFz0J3NLVlyz0E4vjFlFQcQ&n=testnet";
const MOVING = ["/", "/why", "/dashboard", "/runs", "/new", RUN];
const STILL = `document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity) && !document.querySelector("[data-counting]")`;
const fails = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) fails.push(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

// One wallet whose prompt never answers: Connect stays "connecting".
function stubWallet() {
  const provider = {
    request: ({ method }) => method === "eth_requestAccounts" ? new Promise(() => {})
      : method === "eth_accounts" ? Promise.resolve([])
      : method === "eth_chainId" ? Promise.resolve("0x13b2") : Promise.resolve(null),
    on() {}, removeListener() {},
  };
  const info = { uuid: "5c1b8a9e-0000-4000-8000-000000000001", name: "Stub wallet", rdns: "test.stub",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

async function open(path, { theme = "light", reduced = false, js = true, stub = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference", javaScriptEnabled: js,
  });
  await context.addCookies([{ name: "theme", value: theme, domain: "localhost", path: "/" }]);
  await context.addInitScript(() => {
    window.__started = [];
    window.__counting = false;
    document.addEventListener("animationstart", (e) => window.__started.push(e.animationName), true);
    new MutationObserver(() => { if (document.querySelector("[data-counting]")) window.__counting = true; })
      .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-counting"] });
  });
  if (stub) await context.addInitScript(stubWallet);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + path);
  return { context, page, errors };
}
const still = (page) => page.waitForFunction(STILL, undefined, { timeout: 20_000 });
const faint = (page) => page.evaluate(() =>
  [...document.querySelectorAll(".page-in > .grid > .col, .page-in > :not(.grid)")]
    .filter((el) => getComputedStyle(el).opacity !== "1").length);
const countShown = (page) => page.locator(".stat-value .count-up").waitFor({ timeout: 30_000 });
const axeBad = async (page) => {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await axe.run(document)).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id));
};

// Six pages arrive, both themes; axe after they are still. The receipt does not.
for (const theme of ["light", "dark"]) {
  for (const path of MOVING) {
    const { context, page, errors } = await open(path, { theme });
    if (path === RUN) await countShown(page);
    await still(page);
    check((await page.evaluate(() => window.__started)).includes("page-in"), `${theme} ${path}: page-in ran`);
    check((await faint(page)) === 0, `${theme} ${path}: every block fully in`);
    const bad = await axeBad(page);
    check(bad.length === 0, `${theme} ${path}: axe, no serious or critical ${JSON.stringify(bad)}`);
    check(errors.length === 0, `${theme} ${path}: no page errors ${JSON.stringify(errors)}`);
    await context.close();
  }
  const r = await open(RECEIPT, { theme });
  await r.page.getByText("Verified", { exact: true }).first().waitFor({ timeout: 60_000 });
  await still(r.page);
  const started = await r.page.evaluate(() => window.__started);
  check(!started.includes("page-in"), `${theme} /r: no page-in`);
  check(started.includes("print-in"), `${theme} /r: the checks still print in`);
  check((await r.page.locator(".page-in").count()) === 0, `${theme} /r: no page-in wrapper`);
  const bad = await axeBad(r.page);
  check(bad.length === 0, `${theme} /r: axe, no serious or critical ${JSON.stringify(bad)}`);
  await r.context.close();
}

// Stagger: 80 ms a step, the last block started by 400 ms (Review Focus 4).
{
  const { context, page } = await open("/");
  const delays = await page.evaluate(() => [...document.querySelectorAll(".page-in > .grid > .col")]
    .map((c) => parseFloat(getComputedStyle(c).animationDelay)));
  check(delays.length >= 2 && delays[1] === 0.08, `home: the second block waits 80 ms (${delays.slice(0, 3)})`);
  check(Math.max(...delays) <= 0.4, `home: the last block starts by 400 ms (${Math.max(...delays)} s)`);
  await context.close();
}

// No JS: never blank, nothing faint; the wrapper is in the server's HTML (Review Focus 5).
for (const path of [...MOVING, RECEIPT]) {
  const { context, page } = await open(path, { js: false });
  await sleep(1500);
  const m = await page.evaluate(() => ({
    wrapper: !!document.querySelector(".page-in"),
    text: document.querySelector("main")?.innerText.trim().length ?? 0,
  }));
  check(path === RECEIPT ? !m.wrapper : m.wrapper, `no JS ${path}: page-in wrapper ${path === RECEIPT ? "absent" : "in the server's HTML"}`);
  check(m.text > 0 && (await faint(page)) === 0, `no JS ${path}: the page is there, nothing faint`);
  await context.close();
}

// Reduced motion: nothing arrives, nothing rolls.
for (const path of MOVING) {
  const { context, page } = await open(path, { reduced: true });
  if (path === RUN) await countShown(page);
  await sleep(1000);
  const s = await page.evaluate(() => ({ started: window.__started, counting: window.__counting }));
  check(!s.started.includes("page-in"), `reduced ${path}: no page-in`);
  check(!s.counting, `reduced ${path}: no count rolled`);
  await context.close();
}

// The Payments figure counts up and lands on what the table says.
{
  const { context, page } = await open(RUN);
  await countShown(page);
  await still(page);
  const m = await page.evaluate(() => ({
    counted: window.__counting,
    shown: document.querySelector(".stat-value .count-up")?.textContent,
    spoken: document.querySelector(".stat-value .sr-only")?.textContent,
    rows: document.querySelector(".ant-table-summary strong")?.textContent,
  }));
  check(m.counted, "run: the Payments figure counted up");
  check(m.shown === "4" && m.spoken === "4", `run: it lands on 4, shown and spoken (${m.shown}/${m.spoken})`);
  check(m.rows === "4 rows", `run: the table agrees (${m.rows})`);
  await context.close();
}

// Hover lift, both themes; a disabled button stays put.
for (const theme of ["light", "dark"]) {
  const { context, page } = await open("/dashboard", { theme });
  await still(page);
  const btn = page.getByRole("button", { name: "Connect a wallet", exact: true });
  await btn.hover();
  await sleep(250);
  const m = await btn.evaluate((b) => ({ t: getComputedStyle(b).transform, s: getComputedStyle(b).boxShadow }));
  check(m.t === "matrix(1, 0, 0, 1, 0, -1)" && m.s !== "none", `${theme}: a hovered primary button rises 1px with a shadow (${m.t})`);
  await context.close();
}
{
  const { context, page } = await open("/new");
  await still(page);
  const off = page.locator("button.ant-btn:disabled").first();
  await off.hover({ force: true });
  await sleep(250);
  check((await off.evaluate((b) => getComputedStyle(b).transform)) === "none", "a disabled button does not rise");
  await context.close();
}

// Connect says it is connecting; a loading button under the pointer sits at rest (Review Focus 2).
for (const path of ["/dashboard", "/runs"]) {
  const { context, page } = await open(path, { stub: true });
  await still(page);
  const btn = page.getByRole("button", { name: "Connect a wallet", exact: true });
  await btn.hover();
  await btn.click();
  await sleep(300);
  const m = await btn.evaluate((b) => ({ loading: b.classList.contains("ant-btn-loading"), t: getComputedStyle(b).transform }));
  check(m.loading, `${path}: Connect shows the wallet is connecting`);
  check(m.t === "none", `${path}: a loading button under the pointer sits at rest (${m.t})`);
  await context.close();
}

// Navigation: a sidebar link and Back both arrive; nothing left faint (Review Focus 1).
{
  const { context, page } = await open("/dashboard");
  await still(page);
  await page.getByRole("link", { name: "Runs", exact: true }).first().click();
  await page.waitForURL(/\/runs/);
  await still(page);
  const n = await page.evaluate(() => window.__started.filter((a) => a === "page-in").length);
  check(n >= 2 && (await faint(page)) === 0, `navigation: /runs arrives after a sidebar click (${n} page-ins)`);
  await page.goBack();
  await page.waitForURL(/\/dashboard/);
  await still(page);
  const m = await page.evaluate(() => window.__started.filter((a) => a === "page-in").length);
  check(m > n && (await faint(page)) === 0, `navigation: Back arrives too, nothing faint (${m} page-ins)`);
  await context.close();
}

// The home hero at 120, 240 and 360 ms, for spec §8's second unknown.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await context.addCookies([{ name: "theme", value: "light", domain: "localhost", path: "/" }]);
  await context.addInitScript(() => document.addEventListener("animationstart",
    () => { for (const a of document.getAnimations()) a.pause(); }, true));
  const page = await context.newPage();
  await page.goto(BASE + "/");
  await sleep(1500);
  for (const t of [120, 240, 360]) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) a.currentTime = t; }, t);
    await page.locator(".page-in > .grid > .col").first().screenshot({ path: `.playwright-mcp/hero-${t}.png` });
  }
  await context.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `node .verify-motion.mjs`
Expected: every line `✓`, ending `all passed`. A `✗` is a defect: find its cause with superpowers:systematic-debugging, fix it under TDD in the task that owns the code (its test first), commit, and rerun this script.

- [ ] **Step 4: Look at the hero frames** — Read `.playwright-mcp/hero-120.png`, `hero-240.png`, `hero-360.png`.

Rule: the hero keeps page-in if at 240 ms the coins are visibly rolling in beside "Pays in". If the fade still hides the coins' roll at 240 ms, add inside the Task 1 media block in `shell.css`

```css
  .page-in > .grid > .col:has(.coin-tray) { animation: none; }
```

with a test in `frontend/test/motion.test.ts` (`expect(css("shell.css")).toMatch(/\.col:has\(\.coin-tray\)\s*\{\s*animation:\s*none;/)`, written and run failing first), rerun the script, and commit as `fix(web): the home hero skips page-in so the coins' roll reads`. Record the decision either way in the ledger.

- [ ] **Step 5: Answer the spec's unknowns.** In `docs/superpowers/specs/2026-09-29-motion-polish-design.md` §8, replace the table with this one, keeping the one second row that matches the Step 4 finding and deleting the other:

```markdown
| Question | Answer |
|---|---|
| Does a route-level `template.tsx` remount on a search-param change (the `?n=` network)? | No. "Navigations within deeper segments or changes to search parameters do not trigger remounts of higher-level templates" (Next 16.2.9 docs, `template.mdx`) `[docs]`. A route change remounts it: a sidebar click and Back each played page-in on `next start` `[measured]` |
| Does the home page's coin roll read well while the page is still rising? | Yes: at 240 ms the coins are mid-roll and legible, so the hero keeps page-in `[measured]` |
| Does the home page's coin roll read well while the page is still rising? | No: at 240 ms the fade still hid the roll, so the hero column skips page-in (`.col:has(.coin-tray)`) `[measured]` |
```

- [ ] **Step 6: Full suite, build, typecheck**

Run: `pnpm test && pnpm build && (cd frontend && pnpm typecheck)`
Expected: all green; frontend tests grow by the new files (motion 12, count-up 8, connect-buttons 2, run-view +1); scripts 65.

- [ ] **Step 7: Clean up and commit**

```bash
rm .verify-motion.mjs .playwright-mcp/hero-*.png
ls .playwright-mcp   # only axe.min.js
pkill -f "next start -p 3100"   # the server from Step 1
git add docs/superpowers/specs/2026-09-29-motion-polish-design.md
git commit -m "docs(spec): motion polish's unknowns, answered in the browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
