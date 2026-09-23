# Redesign Part 3 — Page Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `/`, `/new`, `/runs`, `/run/[tx]`, `/r/[tx]` and `/why` onto the 12-column grid in the dashboard's card language, stop every amount from guessing its token's decimals, and delete the pre-redesign CSS aliases.

**Architecture:** Three shared presentation components (`Panel`, `StatTile`, `Verdict`) plus a `dense` option on `Grid`. Two small pure view modules carry the only new logic — `lib/run-view.ts` (the run page's four tiles, which tokens to read) and `lib/run-summary-view.ts` (the create flow's side summary) — and one amount convention moves to `lib/token-meta.ts`. Pages then change layout only; state, the wallet hold and the payout sequence are not touched.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, antd 6, vitest 2, the part-1 grid (`components/grid/Grid.tsx`, `lib/grid.ts`).

**Spec:** `docs/superpowers/specs/2026-09-23-page-migration-design.md`

## Global Constraints

- No change to `packages/core`, the contract, `lib/wallet-session.ts`, `components/wallet/WalletProvider.tsx`, `StepSend`'s logic, or any URL.
- **Decimals come from the chain or not at all.** Without them an amount renders as the raw integer and the short token address, e.g. `100000 (0x89B5…D72a)`. No `?? <digit>` fallback for decimals anywhere in `apps/web`.
- **One figure per token.** No pooled totals, no fiat.
- In the app shell (`/dashboard`, `/new`, `/runs`, `/run/[tx]`) the top bar owns the page's `<h1>`; every verdict inside those pages is `<h2>`. On public pages (`/`, `/r/[tx]`, `/why`) the verdict is `<h1>`.
- Breakpoints (part 1): `lg` ≥ 1024, `md` 640–1023, `sm` < 640. At `md` a column is 12 wide unless the task says otherwise; `sm` is always 12.
- Colours only through tokens: `--bg --surface --raised --sidebar --border --control --text --text-soft --link --accent --on-accent --success --warning --danger --success-bg --warning-bg --danger-bg`. `--border` is for decorative rules; anything a user operates (input edge, outline button) uses `--control`.
- User-visible copy passes `apps/web/test/plain-language.test.ts`: no "manifest", "anchor", "salt", "Merkle", "preflight", "commit", "root" or "run label".
- Every table keeps `scroll={{ x: "max-content" }}`.
- Commit after every task in the repo's `type(scope): sentence` style, with two `-m` flags: the subject, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Baseline before Task 1 (measured 2026-09-23): `pnpm test` → core 209, cli 4, web 154 passing; `pnpm typecheck` clean.

## Review Focus

1. **The payer changes wallet or chain while on Preview or Send.** Expected: the summary never shows the old wallet's figures under the new one, and a held send keeps its screen. The summary reads from `summarySource` each render, and CreateRun's reset logic is unchanged. Pinned in Task 5 (`summarySource` returns nothing once `prepared` is gone at step 3), checked in Task 10 Step 4.
2. **A run file with a line in a token no payment used.** Expected: the "owed" figure has that token's real decimals. Pinned in Task 2 (`tokensToRead` includes a token only an `unpaid` row uses), checked in Task 10 Step 6.
3. **A very long run name, or a 66-character run ID, in a 4-column side panel at 1024px.** Expected: no horizontal page scroll. The text wraps inside the panel. Pinned in Task 5 CSS (`overflow-wrap: anywhere` on the summary values), checked at 1024 as well as 1280 in Task 10 Step 7.
4. **A receipt opened on a phone.** Expected: amount, verdict and every check readable at 390px with no sideways scroll. Checked in Task 10 Step 7 on `/r/[tx]` Verified.
5. **Keyboard-only use of the new panels.** Expected: every link and button inside a Panel and the summary shows a visible focus ring. Checked in Task 10 Step 8.

---

## File Structure

```
apps/web/
  components/ui/Panel.tsx           CREATE  surface block, optional <h2> title or head row
  components/ui/StatTile.tsx        CREATE  label / value / secondary line (moved from Dashboard)
  components/ui/Verdict.tsx         CREATE  verdict headline, level 1 | 2
  components/grid/Grid.tsx          MODIFY  dense prop via gridClass
  lib/grid.ts                       MODIFY  gridClass
  lib/token-meta.ts                 MODIFY  TokenMeta, amountFigure, amountText, metaFor
  lib/dashboard-view.ts             MODIFY  re-export amountText/TokenMeta from token-meta
  lib/funding-view.ts               MODIFY  amountFigure instead of ?? 6
  lib/run-view.ts                   CREATE  tokensToRead, reviewCount, runStatsView, STAT_LABELS
  lib/run-summary-view.ts           CREATE  summarySource, runSummaryView
  app/(app)/dashboard/Dashboard.tsx MODIFY  StatTile, h2 verdicts
  app/(public)/r/[txHash]/Receipt.tsx MODIFY  grid + Panel + Verdict
  app/(app)/run/[txHash]/Reconciliation.tsx MODIFY  tiles, panels, tokensToRead, no ?? 6
  app/(app)/new/CreateRun.tsx       MODIFY  grid with summary / CSV help columns
  app/(app)/new/RunSummary.tsx      CREATE
  app/(app)/new/CsvHelp.tsx         CREATE  (moved out of StepUpload)
  app/(app)/new/StepUpload.tsx      MODIFY  h2, CSV help removed
  app/(app)/new/StepPreview.tsx     MODIFY  summary line removed, no ?? 6
  app/(app)/new/StepPreflight.tsx   MODIFY  h2, Run ID moves to the summary
  app/(app)/new/StepSend.tsx        MODIFY  h1 → h2 only
  app/(app)/new/Result.tsx          MODIFY  h1 → h2, no ?? 6
  app/(app)/runs/RunHistory.tsx     MODIFY  grid + panels
  app/(public)/page.tsx             MODIFY  grid + panels
  app/(public)/why/Why.tsx          MODIFY  grid + panels, no ?? 6
  app/globals.css                   MODIFY  panel rules; later aliases and dead classes removed
  test/grid.test.ts                 MODIFY
  test/token-meta.test.ts           CREATE
  test/funding-view.test.ts         MODIFY
  test/run-view.test.ts             CREATE
  test/run-summary-view.test.ts     CREATE
  test/no-legacy-css.test.ts        CREATE  (decimals guard in Task 2, alias guard in Task 9)
  test/plain-language.test.ts       MODIFY  tile and summary copy
```

---

### Task 1: Shared pieces — Panel, StatTile, Verdict, dense grid

**Files:**
- Create: `apps/web/components/ui/Panel.tsx`, `apps/web/components/ui/StatTile.tsx`, `apps/web/components/ui/Verdict.tsx`
- Modify: `apps/web/lib/grid.ts`, `apps/web/components/grid/Grid.tsx`, `apps/web/app/(app)/dashboard/Dashboard.tsx`, `apps/web/app/globals.css`
- Test: `apps/web/test/grid.test.ts`

**Interfaces:**
- Produces:
  - `gridClass({ dense?: boolean; className?: string }): string` in `lib/grid.ts`
  - `Grid` props: `{ children; className?: string; dense?: boolean }`
  - `default function Panel({ title?: string; head?: ReactNode; className?: string; children })` → `<section class="panel">`, with the `head` row first, then `<h2 class="panel-title">` when `title` is set
  - `export type StatTone = "success" | "warning" | "danger"`; `default function StatTile({ label: string; value: ReactNode; tone?: StatTone; sub?: ReactNode })`
  - `default function Verdict({ tone?: string; title: ReactNode; body?: ReactNode; level?: 1 | 2 })`. `tone` is one of `ok | error | critical | degraded`, or omitted. `level` defaults to 2.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/grid.test.ts`:

```ts
import { gridClass } from "@/lib/grid";

describe("gridClass — the grid container's classes", () => {
  it("is just the grid by default", () => {
    expect(gridClass({})).toBe("grid");
  });
  it("adds dense packing only when asked", () => {
    expect(gridClass({ dense: true })).toBe("grid is-dense");
    expect(gridClass({ dense: false })).toBe("grid");
  });
  it("keeps a caller's class", () => {
    expect(gridClass({ dense: true, className: "x" })).toBe("grid is-dense x");
  });
});
```

(Merge the import into the file's existing `import { colVars } from "@/lib/grid";` line.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm vitest run test/grid.test.ts`
Expected: FAIL — `gridClass` is not exported.

- [ ] **Step 3: Implement `gridClass` and the `dense` prop**

Append to `apps/web/lib/grid.ts`:

```ts
/**
 * `dense` lets a column placed to the right with `start` share a row with a
 * column that comes after it in the DOM. /new needs that: its summary comes
 * first in reading order (so a phone shows it before the Send button) but
 * sits on the right at lg. Opt-in, because dense packing can reorder
 * anything that leaves a hole.
 */
export function gridClass({ dense, className }: { dense?: boolean; className?: string }): string {
  return ["grid", dense ? "is-dense" : "", className ?? ""].filter(Boolean).join(" ");
}
```

Replace `Grid` in `apps/web/components/grid/Grid.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { colVars, gridClass, type ColProps } from "@/lib/grid";

export function Grid({ children, className, dense }: { children: ReactNode; className?: string; dense?: boolean }) {
  return <div className={gridClass({ dense, className })}>{children}</div>;
}
```

(`Col` stays as it is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run test/grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the three components**

`apps/web/components/ui/Panel.tsx`:

```tsx
import { useId, type ReactNode } from "react";

/**
 * One block of a page, on the surface colour. Ours rather than antd's Card:
 * Card renders its title in a div, which drops the section out of a screen
 * reader's heading outline.
 */
export default function Panel({
  title, head, className, children,
}: {
  title?: string;
  /** A small row above everything else, e.g. "Payment advice · Arc testnet at block N". */
  head?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={className ? `panel ${className}` : "panel"} aria-labelledby={title ? id : undefined}>
      {head && <div className="panel-head">{head}</div>}
      {title && <h2 id={id} className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}
```

`apps/web/components/ui/StatTile.tsx`:

```tsx
import type { ReactNode } from "react";

export type StatTone = "success" | "warning" | "danger";

/** A figure with its label. Tone colours the value; the value's words carry
 *  the meaning, so colour is never the only signal. */
export default function StatTile({
  label, value, tone, sub,
}: { label: string; value: ReactNode; tone?: StatTone; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <div className={tone ? `stat-value is-${tone}` : "stat-value"}>{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
```

`apps/web/components/ui/Verdict.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * The one-line answer a page gives, and why. `level` follows the shell: the
 * app shell's top bar already holds the page's h1, so verdicts there are h2;
 * public pages have no title bar, so their verdict is the h1.
 */
export default function Verdict({
  tone, title, body, level = 2,
}: {
  /** ok | error | critical | degraded, or none. */
  tone?: string;
  title: ReactNode;
  body?: ReactNode;
  level?: 1 | 2;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className={tone ? `verdict ${tone}` : "verdict"}>
      <H>{title}</H>
      {body !== undefined && <p>{body}</p>}
    </section>
  );
}
```

- [ ] **Step 6: CSS for panels, tiles and verdict headings**

In `apps/web/app/globals.css`, replace the verdict block:

```css
.verdict h1 {
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 0.45rem;
}
.verdict p { margin: 0; max-width: var(--measure); color: var(--ink-soft); }
.verdict.ok h1 { color: var(--tick); }
.verdict.error h1, .verdict.critical h1 { color: var(--flag); }
.verdict.degraded h1 { color: var(--pending); }
```

with:

```css
.verdict :is(h1, h2) {
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 0.45rem;
}
.verdict p { margin: 0; max-width: var(--measure); color: var(--text-soft); }
.verdict.ok :is(h1, h2) { color: var(--success); }
.verdict.error :is(h1, h2), .verdict.critical :is(h1, h2) { color: var(--danger); }
.verdict.degraded :is(h1, h2) { color: var(--warning); }
```

Under the `/* ── dashboard ── */` block, after `.section-title`, add:

```css
.stat-value.is-success { color: var(--success); }
.stat-value.is-warning { color: var(--warning); }
.stat-value.is-danger { color: var(--danger); }
.stat-line { display: block; }

/* ── panels (components/ui/Panel.tsx) ───────────────────────────────── */
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; min-width: 0; }
.panel-title { margin: 0 0 12px; font-size: 1rem; font-weight: 600; }
.panel-head, .page-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 4px 12px; flex-wrap: wrap;
  font-size: 0.85rem; color: var(--text-soft);
}
.panel-head { padding-bottom: 12px; margin-bottom: 4px; border-bottom: 1px solid var(--border); }
.panel-head strong, .page-head strong { color: var(--text); font-weight: 600; }
/* Content that used to open a bare page brings its own top spacing. */
.panel > .verdict:first-child { padding-top: 0; }
.panel > .line:first-child { padding-top: 0.6rem; }
/* A lone block fills its column, so panels in one row share a height. */
.col > .panel:only-child, .col > .stat-tile:only-child { height: 100%; }
.grid.is-dense { grid-auto-flow: row dense; }
```

Inside the existing `@media (max-width: 639px)` block, add `.panel { padding: 16px; }`.

- [ ] **Step 7: The dashboard uses StatTile and h2 verdicts**

In `apps/web/app/(app)/dashboard/Dashboard.tsx`:

Add the import `import StatTile from "@/components/ui/StatTile";`.

Replace the tiles loop body:

```tsx
      {totals.map((t) => {
        const m = meta[t.token.toLowerCase()] ?? {};
        return (
          <Col key={t.token} span={4} md={12}>
            <StatTile
              label={m.symbol || t.token.slice(0, 10)}
              value={!current || retrying
                ? <Skeleton.Input active />
                : coverage?.tilesBlank ? "—" : amountText(t.value, t.token, m)}
              sub={current && !retrying && !coverage?.tilesBlank
                ? `${t.payments} payment${t.payments === 1 ? "" : "s"} · ${t.runs} run${t.runs === 1 ? "" : "s"}`
                : undefined}
            />
          </Col>
        );
      })}
```

In the two `<section className="verdict">` blocks (no wallet, no records), change `<h1>`/`</h1>` to `<h2>`/`</h2>`.

- [ ] **Step 8: Verify**

Run: `cd apps/web && pnpm test && pnpm typecheck && pnpm build`
Expected: all web tests pass (154 + 3 new), typecheck clean, build succeeds. If the build reports that `useId` cannot be used in a Server Component, stop and report it. Do not work around it, because `/` (a Server Component) will render `Panel` in Task 7.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/ui apps/web/lib/grid.ts apps/web/components/grid/Grid.tsx apps/web/test/grid.test.ts "apps/web/app/(app)/dashboard/Dashboard.tsx" apps/web/app/globals.css
git commit -m "feat(web): panel, stat tile and verdict components, and an opt-in dense grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Amounts never guess a decimal

**Files:**
- Modify: `apps/web/lib/token-meta.ts`, `apps/web/lib/dashboard-view.ts`, `apps/web/lib/funding-view.ts`, `apps/web/app/(app)/run/[txHash]/Reconciliation.tsx`, `apps/web/app/(app)/new/StepPreview.tsx`, `apps/web/app/(app)/new/Result.tsx`, `apps/web/app/(public)/why/Why.tsx`
- Create: `apps/web/lib/run-view.ts`
- Test: `apps/web/test/token-meta.test.ts` (create), `apps/web/test/run-view.test.ts` (create), `apps/web/test/funding-view.test.ts`, `apps/web/test/no-legacy-css.test.ts` (create)

**Interfaces:**
- Produces (`lib/token-meta.ts`):
  - `export interface TokenMeta { decimals?: number; symbol?: string }`
  - `amountFigure(value: bigint, token: string, meta: TokenMeta): string`
  - `amountText(value: bigint, token: string, meta: TokenMeta): string`
  - `metaFor(token: string, decimals: Record<string, number>, symbols: Record<string, string>): TokenMeta`
- Produces (`lib/run-view.ts`): `tokensToRead(result: Pick<ReconcileResult, "rows" | "payments">): Address[]`
- `lib/dashboard-view.ts` keeps exporting `amountText` and `TokenMeta` (re-exported), so `Dashboard.tsx` and its test do not change.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/token-meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { amountFigure, amountText, metaFor } from "@/lib/token-meta";

const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const USDC = "0x3600000000000000000000000000000000000000";

describe("amountFigure / amountText — decimals from the chain or not at all", () => {
  it("formats in the token's own decimals", () => {
    expect(amountFigure(12_345_678n, CIRBTC, { decimals: 8 })).toBe("0.12345678");
    expect(amountText(12_345_678n, CIRBTC, { decimals: 8, symbol: "cirBTC" })).toBe("0.12345678 cirBTC");
  });

  it("without decimals shows the raw integer and the token, never a guessed 6", () => {
    expect(amountFigure(12_345_678n, CIRBTC, {})).toBe("12345678 (0x171a…baa0)");
    expect(amountText(12_345_678n, CIRBTC, { symbol: "cirBTC" })).toBe("12345678 (0x171a…baa0)");
    expect(amountFigure(12_345_678n, CIRBTC, {})).not.toBe("12.345678");
  });

  it("falls back to the short address when the symbol is empty", () => {
    expect(amountText(100_000n, USDC, { decimals: 6, symbol: "" })).toBe("0.1 0x3600…0000");
  });

  it("keeps a negative difference's sign", () => {
    expect(amountFigure(-50_000n, USDC, { decimals: 6 })).toBe("-0.05");
  });
});

describe("metaFor — one token's entry from the address-keyed records", () => {
  it("matches the token case-insensitively", () => {
    expect(metaFor("0xABCdef0000000000000000000000000000000001",
      { "0xabcdef0000000000000000000000000000000001": 6 },
      { "0xabcdef0000000000000000000000000000000001": "EURC" },
    )).toEqual({ decimals: 6, symbol: "EURC" });
  });
  it("leaves decimals undefined when none were read", () => {
    expect(metaFor(USDC, {}, {})).toEqual({ decimals: undefined, symbol: undefined });
  });
});
```

`apps/web/test/run-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Address, PaymentRecord, ReconcileRow } from "@ledgerline/core";
import { tokensToRead } from "@/lib/run-view";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as Address;
const pay = (token: Address) => ({ token, value: 1n } as unknown as PaymentRecord);
const row = (status: ReconcileRow["status"], token: Address) => ({ status, token } as unknown as ReconcileRow);

describe("tokensToRead — every token the run page prints an amount in", () => {
  it("includes a token that only an unpaid row uses", () => {
    // The defect: metadata was read for paid tokens only, so an owed-but-unpaid
    // cirBTC line rendered its amount with a guessed 6 decimals, 100x too large.
    const out = tokensToRead({ payments: [pay(USDC)], rows: [row("matched", USDC), row("unpaid", CIRBTC)] });
    expect(out.map((t) => t.toLowerCase())).toEqual([USDC.toLowerCase(), CIRBTC.toLowerCase()]);
  });
  it("lists each token once, whatever its case", () => {
    const out = tokensToRead({ payments: [pay(EURC)], rows: [row("matched", EURC.toLowerCase() as Address)] });
    expect(out).toEqual([EURC]);
  });
  it("is empty for an empty run", () => {
    expect(tokensToRead({ payments: [], rows: [] })).toEqual([]);
  });
});
```

Append to `apps/web/test/funding-view.test.ts`, inside the `describe` block:

```ts
  it("shows raw figures, not guessed ones, for a token with no decimals read", () => {
    const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
    const v = fundingView({
      lines: fundingFor([{ token: CIRBTC, amount: 12_345_678n, to: R }], { [CIRBTC.toLowerCase()]: 1n }),
      usdc: USDC, usdcHold: undefined, decimals: {}, symbols: {},
    });
    expect(v.rows[0]).toMatchObject({ need: "12345678 (0x171a…baa0)", hold: "1 (0x171a…baa0)" });
  });
```

`apps/web/test/no-legacy-css.test.ts`:

```ts
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
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm vitest run test/token-meta.test.ts test/run-view.test.ts test/funding-view.test.ts test/no-legacy-css.test.ts`
Expected: FAIL. `amountFigure`, `metaFor` and `tokensToRead` do not exist; the funding case gives `12.345678`; the guard lists ten lines.

- [ ] **Step 3: The amount convention in `lib/token-meta.ts`**

Add at the top of `apps/web/lib/token-meta.ts` (after the existing imports), and add `import { formatAmount, short } from "@/lib/chain";`:

```ts
export interface TokenMeta { decimals?: number; symbol?: string }

/**
 * The number alone, in the token's own decimals. When those could not be
 * read, the raw integer with the token's address instead: a guessed 6 turns
 * a cirBTC amount (8 decimals) into one 100x too large, and a bare raw
 * integer next to a symbol would read as whole tokens.
 */
export function amountFigure(value: bigint, token: string, meta: TokenMeta): string {
  return meta.decimals === undefined ? `${value} (${short(token)})` : formatAmount(value, meta.decimals);
}

/** The figure with its symbol, or the same raw text when decimals are unknown. */
export function amountText(value: bigint, token: string, meta: TokenMeta): string {
  if (meta.decimals === undefined) return amountFigure(value, token, meta);
  return `${formatAmount(value, meta.decimals)} ${meta.symbol || short(token)}`;
}

/** One token's entry from records keyed by lowercased address. */
export function metaFor(
  token: string, decimals: Record<string, number>, symbols: Record<string, string>,
): TokenMeta {
  const k = token.toLowerCase();
  return { decimals: decimals[k], symbol: symbols[k] };
}
```

In `apps/web/lib/dashboard-view.ts`, delete the `TokenMeta` interface and the `amountText` function, then:
- replace `import { formatAmount, short } from "@/lib/chain";` with:

```ts
import { amountText, type TokenMeta } from "@/lib/token-meta";

export { amountText };
export type { TokenMeta };
```

- [ ] **Step 4: `tokensToRead`**

`apps/web/lib/run-view.ts`:

```ts
import type { Address, ReconcileResult } from "@ledgerline/core";

/**
 * Every token the run page prints an amount in: the ones paid, and the ones
 * a loaded run file says were owed but never paid. Reading only the paid ones
 * left an unpaid line's owed amount with no decimals to format it in.
 */
export function tokensToRead(result: Pick<ReconcileResult, "rows" | "payments">): Address[] {
  const seen = new Map<string, Address>();
  for (const t of [...result.payments.map((p) => p.token), ...result.rows.map((r) => r.token)]) {
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()];
}
```

- [ ] **Step 5: Replace all ten fallbacks**

`apps/web/lib/funding-view.ts`: add `import { amountFigure } from "@/lib/token-meta";`, keep `short` from `@/lib/chain` and drop `formatAmount`. Replace the body of `lines.map`:

```ts
  const rows = lines.map((l): FundingRow => {
    const key = l.token.toLowerCase();
    const m = { decimals: decimals[key] };
    const row: FundingRow = {
      key,
      symbol: symbols[key] || short(l.token),
      need: amountFigure(l.need, l.token, m),
      hold: l.hold === undefined ? undefined : amountFigure(l.hold, l.token, m),
      state: l.hold === undefined ? "unknown" : l.short > 0n ? "short" : "ok",
    };
    if (l.short > 0n) row.shortBy = amountFigure(l.short, l.token, m);
    return row;
  });
```

`apps/web/app/(app)/run/[txHash]/Reconciliation.tsx`:
- Add imports: `import { amountFigure, amountText } from "@/lib/token-meta";` and `import { tokensToRead } from "@/lib/run-view";`.
- In `loadRun`, replace `for (const token of new Set(result.payments.map((p) => p.token))) {` with `for (const token of tokensToRead(result)) {`.
- Summary line (`<li key={t}>` in the `line--summary` block) and the table footer: replace each
  `<span className="hex">{formatAmount(total, m?.decimals ?? 6)}</span>{" "}{m?.symbol ?? short(t)}` (footer: `{m?.symbol ?? ""}`)
  with `<span className="hex">{amountText(total, t, m ?? {})}</span>`.
- In `Amount`, replace `const d = tokens.get(row.token.toLowerCase())?.decimals ?? 6;` with:

```ts
  const m = tokens.get(row.token.toLowerCase()) ?? {};
  const f = (v: bigint) => amountFigure(v, row.token, m);
```

  and every `formatAmount(X, d)` in `Amount` with `f(X)`.
- In `RowDetail`, the same two lines replace its `const d = …`, and `formatAmount(row.actual!, d)` / `formatAmount(row.expected!, d)` become `f(row.actual!)` / `f(row.expected!)`.
- Remove `formatAmount` from the `@/lib/chain` import if nothing else uses it (typecheck will say).

`apps/web/app/(app)/new/StepPreview.tsx`: add `import { amountFigure, amountText, metaFor } from "@/lib/token-meta";`.
- Amount column: `<span className="hex">{amountFigure(a, r.token, metaFor(r.token, draft.decimals, draft.symbols))}</span>`
- Totals list item: replace the `<span className="hex">…</span>{" "}{draft.symbols[t] ?? short(t)}` pair with `<span className="hex">{amountText(v, t, metaFor(t, draft.decimals, draft.symbols))}</span>`.
- Drop `formatAmount` from the `@/lib/chain` import.

`apps/web/app/(app)/new/Result.tsx`: add `import { amountFigure, amountText, metaFor } from "@/lib/token-meta";`.
- `exportRows`: `amount: amountFigure(r.amount, r.token, metaFor(r.token, draft.decimals, draft.symbols)),`
- Paid column: replace the span's contents with `{amountText(a, r.token, metaFor(r.token, draft.decimals, draft.symbols))}`.
- Drop `formatAmount` from the `@/lib/chain` import.

`apps/web/app/(public)/why/Why.tsx`: add `import { amountText } from "@/lib/token-meta";` and replace the `amount` helper:

```ts
  const amount = (t: Address, v: bigint) => amountText(v, t, tok(t) ?? {});
```

Drop `formatAmount` from its `@/lib/chain` import if unused.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && pnpm test && pnpm typecheck`
Expected: PASS, including the guard. `grep -rn "?? 6" app components lib` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib apps/web/test "apps/web/app/(app)/run/[txHash]/Reconciliation.tsx" "apps/web/app/(app)/new/StepPreview.tsx" "apps/web/app/(app)/new/Result.tsx" "apps/web/app/(public)/why/Why.tsx"
git commit -m "fix(web): never format an amount in guessed decimals, and read metadata for every owed token" -m "An unpaid run-file line in a token no payment used rendered its owed amount with a guessed 6 decimals, 100x too large for cirBTC. The run page now reads metadata for every row's token, and all ten ?? 6 fallbacks go through one convention: the chain's decimals, or the raw integer with the token's address. A guard test keeps them gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `/r/[tx]` — the receipt in one panel

**Files:**
- Modify: `apps/web/app/(public)/r/[txHash]/Receipt.tsx`

**Interfaces:**
- Consumes: `Grid`, `Col` (`@/components/grid/Grid`), `Panel`, `Verdict` (Task 1).

- [ ] **Step 1: Replace the page frame**

In `Receipt.tsx`, add imports:

```tsx
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import Verdict from "@/components/ui/Verdict";
```

Delete the local `function Verdict(...)` at the bottom of the file.

Replace the whole `return (…)` of `Receipt` with:

```tsx
  return (
    <Grid>
      <Col start={4} span={6} md={{ start: 2, span: 10 }}>
        <Panel
          head={
            <>
              <strong>Payment advice</strong>
              <span>
                Arc {net.name}
                {data ? ` at block ${data.blockNumber.toLocaleString("en-US")}` : ""}
              </span>
            </>
          }
        >
          {phase === "loading" && <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 20 }} />}

          {phase === "tx_not_found" && (
            <Verdict level={1} tone="error" title="No such transaction on Arc"
              body={`Nothing on Arc ${net.name} matches this hash. If the payer sent it on a different network, ask them for the right link.`} />
          )}

          {phase === "rpc_unreachable" && (
            <>
              <Verdict level={1} tone="degraded" title="Could not reach Arc"
                body="This says nothing about the payment — only that the checks could not run. Try again, or point the page at another endpoint below." />
              {error && <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} />}
            </>
          )}

          {phase === "ready" && data && (
            <Ready data={data} net={net} txHash={props.txHash} invoiceId={props.invoiceId} />
          )}
        </Panel>

        <footer className="footer">
          <div>
            Checked against <span className="endpoint">{rpc}</span>{" "}
            <button
              className="linkish"
              onClick={() => {
                const next = window.prompt("Arc RPC endpoint to verify against", rpc);
                if (next) setRpc(next.trim());
              }}
            >
              change
            </button>
          </div>
          <p style={{ maxWidth: "62ch", marginTop: "0.6rem" }}>
            Every check above reads the chain directly. Point this page at your own node and
            it will reach the same answer, or a different one — either way you are not taking
            Ledgerline&apos;s word for it.
          </p>
        </footer>
      </Col>
    </Grid>
  );
```

In `Ready`, replace `<Verdict tone={copy.tone} headline={copy.headline} body={copy.body} />` with:

```tsx
      <Verdict level={1} tone={copy.tone} title={copy.headline} body={copy.body} />
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm test && pnpm build`
Expected: clean, all pass.

Then run `pnpm start --port 3055` (background) and open a real receipt link: take one from `/runs` → Open → the Receipt column, or use any `/r/…` link recorded in earlier verification notes. Check:
- the panel sits in columns 4–9 at 1280px and full width at 390px;
- the page has exactly one `<h1>` (`document.querySelectorAll("h1").length === 1`);
- the verdict still reads **Verified** with all checks passing.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(public)/r/[txHash]/Receipt.tsx"
git commit -m "feat(web): the receipt as one centred panel, its masthead as the panel's header" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `/run/[tx]` — four tiles, a table panel, recovery beside it

**Files:**
- Modify: `apps/web/lib/run-view.ts`, `apps/web/app/(app)/run/[txHash]/Reconciliation.tsx`, `apps/web/test/plain-language.test.ts`
- Test: `apps/web/test/run-view.test.ts`

**Interfaces:**
- Consumes: `StatTile`, `StatTone`, `Panel`, `Verdict` (Task 1); `amountText`, `TokenMeta` (Task 2); `SEVERITY`, `statusView` (`@/lib/reconcile-view`).
- Produces (`lib/run-view.ts`):
  - `reviewCount(rows: ReconcileRow[], hasManifest: boolean): number`
  - `export interface StatView { key: "payments" | "completeness" | "review" | "recorded"; label: string; value: string; tone?: StatTone; sub: string[] }`
  - `runStatsView(input: { payments: PaymentRecord[]; rows: ReconcileRow[]; completeness: Completeness; hasManifest: boolean; blockNumber: bigint; meta: Map<string, TokenMeta> }): StatView[]` returns the four tiles in that order
  - `STAT_LABELS: readonly ["Payments", "Completeness", "Review", "Recorded"]`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/run-view.test.ts` (merge imports: add `Completeness` to the `@ledgerline/core` type import, and `runStatsView, reviewCount, STAT_LABELS` to the `@/lib/run-view` import):

```ts
const paid = (token: Address, value: bigint) => ({ token, value } as unknown as PaymentRecord);
const comp = (verdict: Completeness["verdict"], extra: Partial<Completeness> = {}): Completeness =>
  ({ verdict, found: 2, missing: 0, surplus: 0, note: "n", ...extra });
const meta = new Map([
  [USDC.toLowerCase(), { decimals: 6, symbol: "USDC" }],
  [CIRBTC.toLowerCase(), { decimals: 8, symbol: "cirBTC" }],
]);
const stats = (over: Partial<Parameters<typeof runStatsView>[0]> = {}) => runStatsView({
  payments: [paid(USDC, 100_000n), paid(CIRBTC, 1_000n), paid(USDC, 200_000n)],
  rows: [row("matched", USDC), row("matched", CIRBTC), row("matched", USDC)],
  completeness: comp("complete"), hasManifest: true, blockNumber: 1234567n, meta, ...over,
});

describe("runStatsView — the run page's four tiles", () => {
  it("always four, in a fixed order", () => {
    expect(stats().map((s) => s.label)).toEqual([...STAT_LABELS]);
  });

  it("Payments: the count, and one total per token in its own decimals, never pooled", () => {
    expect(stats()[0]).toMatchObject({ value: "3", sub: ["0.3 USDC", "0.00001 cirBTC"] });
  });

  it("Payments: a token without metadata shows its raw integer", () => {
    expect(stats({ payments: [paid(EURC, 5n)], rows: [row("matched", EURC)] })[0]!.sub)
      .toEqual(["5 (0xbEf5…21c1)"]);
  });

  it("Completeness: each verdict has a word and a tone", () => {
    expect(stats({ completeness: comp("complete") })[1]).toMatchObject({ value: "Complete", tone: "success" });
    expect(stats({ completeness: comp("incomplete", { missing: 2 }) })[1]).toMatchObject({ value: "2 missing", tone: "danger" });
    expect(stats({ completeness: comp("over", { surplus: 1 }) })[1]).toMatchObject({ value: "1 not on the list", tone: "danger" });
    expect(stats({ completeness: comp("unknown") })[1]).toMatchObject({ value: "Unknown", tone: "warning" });
  });

  it("Review: all matched, or how many to review, with per-status counts", () => {
    expect(stats()[2]).toMatchObject({ value: "All matched", tone: "success", sub: ["3 matched"] });
    const r = stats({ rows: [row("matched", USDC), row("unpaid", CIRBTC), row("amount_mismatch", USDC)] })[2]!;
    expect(r).toMatchObject({ value: "2 to review", tone: "warning" });
    expect(r.sub).toEqual(["1 not paid, 1 wrong amount, 1 matched"]);
  });

  it("Review: without a run file nothing is 'to review' — every payment is simply read from chain", () => {
    const r = stats({ hasManifest: false, rows: [row("unexpected", USDC), row("unexpected", USDC)] })[2]!;
    expect(r).toMatchObject({ value: "Read from chain", tone: undefined });
    expect(reviewCount([row("unexpected", USDC)], false)).toBe(0);
    expect(reviewCount([row("unexpected", USDC)], true)).toBe(1);
  });

  it("Recorded: the block, formatted", () => {
    expect(stats()[3]).toMatchObject({ value: "Block 1,234,567" });
  });
});
```

Append to `apps/web/test/plain-language.test.ts`, inside its main `describe` (add `import { runStatsView } from "@/lib/run-view";` at the top):

```ts
  it("the run page's tiles", () => {
    for (const hasManifest of [true, false]) {
      for (const verdict of ["complete", "incomplete", "over", "unknown"] as const) {
        for (const s of runStatsView({
          payments: [], rows: [], hasManifest, blockNumber: 1n, meta: new Map(),
          completeness: { verdict, found: 0, missing: 1, surplus: 1, note: "" },
        })) { clean(s.label); clean(s.value); s.sub.forEach(clean); }
      }
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm vitest run test/run-view.test.ts test/plain-language.test.ts`
Expected: FAIL — `runStatsView`, `reviewCount`, `STAT_LABELS` not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/run-view.ts` (extend the type import to `Address, Completeness, PaymentRecord, ReconcileResult, ReconcileRow, ReconcileStatus`):

```ts
import { SEVERITY, statusView } from "@/lib/reconcile-view";
import { amountText, type TokenMeta } from "@/lib/token-meta";
import type { StatTone } from "@/components/ui/StatTile";

export const STAT_LABELS = ["Payments", "Completeness", "Review", "Recorded"] as const;

export interface StatView {
  key: "payments" | "completeness" | "review" | "recorded";
  label: string;
  value: string;
  tone?: StatTone;
  sub: string[];
}

/**
 * Without a run file every payment is `unexpected` by definition — there is
 * no intent to compare against — so counting those as things to review would
 * contradict the completeness verdict beside them.
 */
export function reviewCount(rows: ReconcileRow[], hasManifest: boolean): number {
  return rows.filter((r) => r.status !== "matched" && !(r.status === "unexpected" && !hasManifest)).length;
}

export function runStatsView({
  payments, rows, completeness: c, hasManifest, blockNumber, meta,
}: {
  payments: PaymentRecord[]; rows: ReconcileRow[]; completeness: Completeness;
  hasManifest: boolean; blockNumber: bigint; meta: Map<string, TokenMeta>;
}): StatView[] {
  // Emitted Transfer values, per token, never pooled (invariant 5).
  const perToken = new Map<string, { token: string; total: bigint }>();
  for (const p of payments) {
    const k = p.token.toLowerCase();
    perToken.set(k, { token: p.token, total: (perToken.get(k)?.total ?? 0n) + p.value });
  }

  const counts = new Map<ReconcileStatus, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const breakdown = [...counts.entries()]
    .sort((a, b) => SEVERITY[a[0]] - SEVERITY[b[0]])
    .map(([s, n]) => `${n} ${statusView(s, hasManifest).label.toLowerCase()}`)
    .join(", ");

  const completeness: Record<Completeness["verdict"], { value: string; tone: StatTone }> = {
    complete: { value: "Complete", tone: "success" },
    incomplete: { value: `${c.missing} missing`, tone: "danger" },
    over: { value: `${c.surplus} not on the list`, tone: "danger" },
    unknown: { value: "Unknown", tone: "warning" },
  };

  const review = reviewCount(rows, hasManifest);

  return [
    {
      key: "payments", label: STAT_LABELS[0], value: String(payments.length),
      sub: [...perToken.values()].map(({ token, total }) =>
        amountText(total, token, meta.get(token.toLowerCase()) ?? {})),
    },
    { key: "completeness", label: STAT_LABELS[1], ...completeness[c.verdict], sub: [] },
    {
      key: "review", label: STAT_LABELS[2],
      value: review ? `${review} to review` : hasManifest ? "All matched" : "Read from chain",
      tone: review ? "warning" : hasManifest ? "success" : undefined,
      sub: breakdown ? [breakdown] : [],
    },
    { key: "recorded", label: STAT_LABELS[3], value: `Block ${blockNumber.toLocaleString("en-US")}`, sub: [] },
  ];
}
```

Note: `statusView("unexpected", false).label` is `"Paid"`, so without a run file the breakdown reads "2 paid". That matches the table's filter labels today.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm vitest run test/run-view.test.ts test/plain-language.test.ts`
Expected: PASS. If the per-status breakdown's order differs from the test, `SEVERITY` in `lib/reconcile-view.ts` is the source of truth: unlinked 0, unpaid 1, recipient_mismatch 2, amount_mismatch 3, unexpected 4, matched 5. Fix the test's expectation to match it, not `SEVERITY`.

- [ ] **Step 5: Lay the page out**

In `Reconciliation.tsx` add imports:

```tsx
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import StatTile from "@/components/ui/StatTile";
import Verdict from "@/components/ui/Verdict";
import { runStatsView, STAT_LABELS } from "@/lib/run-view";
```

(merge `runStatsView, STAT_LABELS` into the existing `@/lib/run-view` import from Task 2). Delete the local `Headline` function.

Replace the whole `return (…)` of `Reconciliation` with:

```tsx
  const failed = (tone: string, title: string, body: string, extra?: React.ReactNode) => (
    <Col span={12}>
      <Panel>
        <Verdict tone={tone} title={title} body={body} />
        {extra}
      </Panel>
    </Col>
  );

  return (
    <Grid>
      {phase === "loading" && (
        <>
          {STAT_LABELS.map((label) => (
            <Col key={label} span={3} md={6}>
              <StatTile label={label} value={<Skeleton.Input active size="small" />} />
            </Col>
          ))}
          <Col span={12}><Panel><Skeleton active paragraph={{ rows: 8 }} /></Panel></Col>
        </>
      )}

      {phase === "tx_not_found" && failed("error", "No such transaction on Arc",
        `Nothing on Arc ${net.name} matches this hash. If the run was sent on a different network, switch with ?n=mainnet.`)}

      {phase === "run_reverted" && failed("error", "This payout run did not execute",
        "The transaction reverted. No money moved, nothing was paid, and nothing was recorded. The run is safe to send again.",
        <p style={{ marginTop: "1.2rem", marginBottom: 0 }}>
          <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">Inspect the failed transaction</a>
        </p>)}

      {phase === "rpc_unreachable" && failed("degraded", "Could not reach Arc",
        "This says nothing about the run — only that the checks could not run. Try another endpoint below.",
        error ? <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} /> : undefined)}

      {phase === "ready" && data && (
        <Ready
          data={data} net={net} txHash={txHash} hasManifest={!!manifest}
          runSalt={(runSalt as Hex | null) ?? manifest?.runSalt}
          manifestName={manifestName} runLabel={runLabel}
          onManifest={(m, name) => { setManifest(m); setManifestName(name); }}
        />
      )}

      <Col span={12}>
        <footer className="footer">
          <div>
            Checked against <span className="endpoint">{rpc}</span>{" "}
            <button className="linkish" onClick={() => {
              const next = window.prompt("Arc RPC endpoint to verify against", rpc);
              if (next) setRpc(next.trim());
            }}>change</button>
          </div>
        </footer>
      </Col>
    </Grid>
  );
```

In `Ready`:
- Delete the `problems` constant. Keep `counts` (the table's filters use it) and `perToken` (the table footer uses it).
- Add after `receiptFor`:

```tsx
  const stats = runStatsView({
    payments: result.payments, rows: result.rows, completeness,
    hasManifest, blockNumber: data.blockNumber, meta: tokens,
  });
```

- In the Recipient column, change `var(--flag)` to `var(--danger)`.
- Replace everything from `return (` to the end of `Ready` with:

```tsx
  return (
    <>
      {stats.map((s) => (
        <Col key={s.key} span={3} md={6}>
          <StatTile
            label={s.label} tone={s.tone} value={s.value}
            sub={s.key === "recorded"
              ? <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View on explorer</a>
              : s.sub.length ? s.sub.map((line) => <span key={line} className="stat-line">{line}</span>) : undefined}
          />
        </Col>
      ))}

      <Col span={12}><p className="coverage-line">{completeness.note}</p></Col>

      {!hasManifest && (
        <Col span={12}>
          {/* The existing "Reading without the run file" <Alert type="info" …/>, unchanged except that its style={{ marginTop: 22 }} is removed. */}
        </Col>
      )}

      {hasManifest && data.manifestCheck && (
        <Col span={12}>
          {/* The existing manifest-check <Alert …/>, unchanged except that its style={{ marginTop: 22 }} is removed. */}
        </Col>
      )}

      <Col span={12}>
        <Panel title="Payments in this run">
          {/* The existing <Table<ReconcileRow> …/>, unchanged, no wrapping div. */}
        </Panel>
      </Col>

      <Col span={8} md={12}>
        <Panel>
          <RecoverLinks
            net={net} txHash={txHash}
            memoIdsOnChain={new Set(result.payments.map((p) => p.memoId.toLowerCase()))}
            payments={result.payments}
            anchoredRoot={data.anchoredRoot}
            anchorPayer={data.anchorPayer}
            initialLabel={runLabel ?? ""}
          />
        </Panel>
      </Col>
    </>
  );
```

The three `{/* … */}` markers mean *move the existing element here verbatim*. They are not placeholders for new code. Delete the old `line--summary` section, the old completeness `<section className="verdict">`, the `<div style={{ marginTop: 26 }}>` table wrapper, and the closing "This run on the explorer" paragraph (the Recorded tile carries that link now).

- In `Amount` and `RowDetail`, change `var(--flag)` to `var(--danger)`.
- In `RecoverLinks`, change `<details open={!!initialLabel} style={{ marginTop: 26 }}>` to `<details open={!!initialLabel}>`.
- Remove any import that is now unused (typecheck will say).

- [ ] **Step 6: Verify**

Run: `cd apps/web && pnpm test && pnpm typecheck && pnpm build`
Expected: all pass, clean.

Then `pnpm start --port 3055` and open a real testnet run: `/run/0x0914b2ee684e1b84dd1227a21899335098cb9ecdcd7dee7366f1e9b159a13de0?n=testnet` (0.1 USDC + 0.1 EURC). Expected:
- four tiles in one row at 1280px and two rows of two at 768px;
- Payments reads `2` with `0.1 USDC` and `0.1 EURC`;
- Recorded links to the explorer;
- the table sits in a panel.

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/run-view.ts apps/web/test/run-view.test.ts apps/web/test/plain-language.test.ts "apps/web/app/(app)/run/[txHash]/Reconciliation.tsx"
git commit -m "feat(web): the run page as four tiles, the payments table in a panel and link recovery beside it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `/new` — step content with a sticky run summary

**Files:**
- Create: `apps/web/lib/run-summary-view.ts`, `apps/web/app/(app)/new/RunSummary.tsx`, `apps/web/app/(app)/new/CsvHelp.tsx`
- Modify: `apps/web/app/(app)/new/CreateRun.tsx`, `StepUpload.tsx`, `StepPreview.tsx`, `StepPreflight.tsx`, `StepSend.tsx`, `Result.tsx` (all under `apps/web/app/(app)/new/`), `apps/web/app/globals.css`, `apps/web/test/plain-language.test.ts`
- Test: `apps/web/test/run-summary-view.test.ts`

**Interfaces:**
- Consumes: `Grid` with `dense`, `Col`, `Panel` (Task 1); `amountText`, `metaFor` (Task 2); `runIdFor`, `Manifest`, `tokensForChain` from `@ledgerline/core`.
- Produces (`lib/run-summary-view.ts`):
  - `export interface SummaryItem { token: string; amount: bigint }`
  - `export interface SummarySource { items: SummaryItem[]; payer?: string; runId?: string }`
  - `summarySource(step: number, draft: { rows: SummaryItem[] } | undefined, manifest: Manifest | undefined): SummarySource | undefined`
  - `export interface RunSummaryView { name: string; payments: string; toPay: string[]; runId?: string }`
  - `runSummaryView(runLabel: string, src: SummarySource, tokenOrder: string[], decimals: Record<string, number>, symbols: Record<string, string>): RunSummaryView`

Step indices in `CreateRun` are `0 Upload, 1 Review, 2 Check, 3 Pay, 4 Receipts`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/run-summary-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runIdFor, type Address, type Hex, type Manifest } from "@ledgerline/core";
import { summarySource, runSummaryView } from "@/lib/run-summary-view";

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const ORDER = [USDC, EURC, CIRBTC];
const decimals = { [USDC]: 6, [EURC.toLowerCase()]: 6, [CIRBTC]: 8 };
const symbols = { [USDC]: "USDC", [EURC.toLowerCase()]: "EURC", [CIRBTC]: "cirBTC" };
const PAYER = "0x1111111111111111111111111111111111111111" as Address;
const R = "0x2222222222222222222222222222222222222222" as Address;

const draft = { rows: [{ token: USDC, amount: 1_000_000n }] };
const manifest: Manifest = {
  clientRunId: ("0x" + "ab".repeat(32)) as Hex, payer: PAYER, chainId: 5042002,
  runSalt: ("0x" + "00".repeat(32)) as Hex,
  items: [{ invoiceId: "A", token: USDC as Address, to: R, amount: 2_000_000n }],
};

describe("summarySource — which list the summary describes at each step", () => {
  it("nothing on Upload or on the receipts screen", () => {
    expect(summarySource(0, draft, undefined)).toBeUndefined();
    expect(summarySource(4, draft, manifest)).toBeUndefined();
  });

  it("the draft on Review and Check, with no run ID yet", () => {
    expect(summarySource(1, draft, undefined)).toEqual({ items: draft.rows });
    expect(summarySource(2, draft, undefined)).toEqual({ items: draft.rows });
  });

  it("on Pay, exactly what is signed — the prepared list, its payer and run ID — not the draft", () => {
    const s = summarySource(3, draft, manifest)!;
    expect(s.items).toBe(manifest.items);
    expect(s.payer).toBe(PAYER);
    expect(s.runId).toBe(runIdFor(PAYER, manifest.clientRunId));
  });

  it("on Pay with nothing prepared (reset by a wallet change), nothing rather than the draft", () => {
    expect(summarySource(3, draft, undefined)).toBeUndefined();
  });
});

describe("runSummaryView — the summary's words", () => {
  it("one total per token, in the chain's token order, never pooled", () => {
    const v = runSummaryView("Payroll 2026-09", {
      items: [
        { token: EURC, amount: 500_000n }, { token: USDC, amount: 1_000_000n },
        { token: USDC, amount: 2_000_000n }, { token: CIRBTC, amount: 1n },
      ],
    }, ORDER, decimals, symbols);
    expect(v).toEqual({
      name: "Payroll 2026-09", payments: "4 payments",
      toPay: ["3 USDC", "0.5 EURC", "0.00000001 cirBTC"], runId: undefined,
    });
  });

  it("singular for one payment, and the run ID when there is one", () => {
    const v = runSummaryView("x", { items: [{ token: USDC, amount: 1n }], runId: "0xrun" }, ORDER, decimals, symbols);
    expect(v.payments).toBe("1 payment");
    expect(v.runId).toBe("0xrun");
  });

  it("a token without decimals shows its raw integer", () => {
    const v = runSummaryView("x", { items: [{ token: CIRBTC, amount: 5n }] }, ORDER, {}, {});
    expect(v.toPay).toEqual(["5 (0x171a…baa0)"]);
  });
});
```

Append to `apps/web/test/plain-language.test.ts` (import `runSummaryView` from `@/lib/run-summary-view`):

```ts
  it("the create flow's run summary", () => {
    const v = runSummaryView("Payroll", { items: [], runId: "0x1" }, [], {}, {});
    clean(v.name); clean(v.payments); v.toPay.forEach(clean);
    for (const label of ["This run", "Name", "Payments", "To pay", "Network", "Paying wallet", "Run ID", "Not connected"]) clean(label);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm vitest run test/run-summary-view.test.ts test/plain-language.test.ts`
Expected: FAIL — module `@/lib/run-summary-view` not found.

- [ ] **Step 3: Implement the view module**

`apps/web/lib/run-summary-view.ts`:

```ts
import { runIdFor, type Manifest } from "@ledgerline/core";
import { amountText, metaFor } from "@/lib/token-meta";

export interface SummaryItem { token: string; amount: bigint }
export interface SummarySource { items: SummaryItem[]; payer?: string; runId?: string }

/**
 * Which list the side summary describes. On Pay it is the prepared list —
 * exactly what the wallet is about to sign — never the draft it was built
 * from. With nothing prepared on Pay (a wallet change just reset it) it is
 * nothing, so the card never describes a run that is no longer the one
 * on screen.
 */
export function summarySource(
  step: number, draft: { rows: SummaryItem[] } | undefined, manifest: Manifest | undefined,
): SummarySource | undefined {
  if (step === 3) {
    return manifest
      ? { items: manifest.items, payer: manifest.payer, runId: runIdFor(manifest.payer, manifest.clientRunId) }
      : undefined;
  }
  if ((step === 1 || step === 2) && draft) return { items: draft.rows };
  return undefined;
}

export interface RunSummaryView { name: string; payments: string; toPay: string[]; runId?: string }

/** Requested amounts ("To pay"), one line per token in the chain's order. */
export function runSummaryView(
  runLabel: string, src: SummarySource, tokenOrder: string[],
  decimals: Record<string, number>, symbols: Record<string, string>,
): RunSummaryView {
  const totals = new Map<string, { token: string; total: bigint }>();
  for (const i of src.items) {
    const k = i.token.toLowerCase();
    totals.set(k, { token: i.token, total: (totals.get(k)?.total ?? 0n) + i.amount });
  }
  const rank = (t: string) => {
    const i = tokenOrder.findIndex((o) => o.toLowerCase() === t.toLowerCase());
    return i === -1 ? tokenOrder.length : i;
  };
  const toPay = [...totals.values()]
    .sort((a, b) => rank(a.token) - rank(b.token))
    .map(({ token, total }) => amountText(total, token, metaFor(token, decimals, symbols)));
  const n = src.items.length;
  return { name: runLabel, payments: `${n} payment${n === 1 ? "" : "s"}`, toPay, runId: src.runId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm vitest run test/run-summary-view.test.ts test/plain-language.test.ts`
Expected: PASS.

- [ ] **Step 5: The two side-column components**

`apps/web/app/(app)/new/RunSummary.tsx`:

```tsx
import Panel from "@/components/ui/Panel";
import { short } from "@/lib/chain";
import type { RunSummaryView } from "@/lib/run-summary-view";

/** What is about to be paid, kept in view while the steps change. */
export default function RunSummary({
  view, network, payer,
}: { view: RunSummaryView; network: string; payer?: string }) {
  return (
    <Panel title="This run">
      <dl className="detail run-summary">
        <dt>Name</dt><dd>{view.name}</dd>
        <dt>Payments</dt><dd>{view.payments}</dd>
        <dt>To pay</dt>
        <dd>{view.toPay.map((t) => <span key={t} className="hex stat-line">{t}</span>)}</dd>
        <dt>Network</dt><dd>Arc {network}</dd>
        <dt>Paying wallet</dt>
        <dd>{payer ? <span className="hex addr" title={payer}>{short(payer)}</span> : "Not connected"}</dd>
        {view.runId && (<><dt>Run ID</dt><dd className="hex">{view.runId}</dd></>)}
      </dl>
    </Panel>
  );
}
```

`apps/web/app/(app)/new/CsvHelp.tsx`. This is the `<details>` body from `StepUpload`, moved into a Panel:

```tsx
import Panel from "@/components/ui/Panel";
import { SAMPLE_CSV, sampleCsvHref } from "@/lib/sample-csv";

export default function CsvHelp() {
  return (
    <Panel title="What the file must look like">
      <pre className="hex" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{SAMPLE_CSV}</pre>
      <p className="because">
        Header required and spelled exactly as above. Amounts are written the way you
        would write them on an invoice; this page converts them using each token&apos;s
        own decimals, read from the chain.{" "}
        <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download this sample</a>{" "}
        and replace the recipients with your own.
      </p>
    </Panel>
  );
}
```

Add to `apps/web/app/globals.css`, after the panel rules:

```css
/* The side summary is 4 columns wide: long names and run IDs wrap inside it. */
dl.detail.run-summary { grid-template-columns: minmax(6rem, auto) 1fr; }
dl.detail.run-summary dd { overflow-wrap: anywhere; }
```

- [ ] **Step 6: Take the summary pieces out of the steps**

- `StepUpload.tsx`: delete the whole `<details style={{ marginTop: 26 }}>…</details>` block and the now-unused `SAMPLE_CSV, sampleCsvHref` import. Change the verdict's `<h1>`/`</h1>` to `<h2>`/`</h2>`.
- `StepPreview.tsx`: delete the `const totals = new Map…` loop and the whole `<section className="line line--summary">…</section>`. Drop `amountText` from its `@/lib/token-meta` import if nothing else uses it.
- `StepPreflight.tsx`: delete the `<dt>Run ID</dt>` and its `<dd>` (the `List fingerprint` pair stays), drop `runIdFor` from the core import, and change the verdict's `<h1>`/`</h1>` to `<h2>`/`</h2>`.
- `StepSend.tsx`: change the three verdict `<h1>`/`</h1>` pairs to `<h2>`/`</h2>`. **Nothing else in this file changes.**
- `Result.tsx`: change the verdict's `<h1>`/`</h1>` to `<h2>`/`</h2>`.

- [ ] **Step 7: Lay out `CreateRun`**

In `CreateRun.tsx` add imports:

```tsx
import { tokensForChain } from "@ledgerline/core";
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import { summarySource, runSummaryView } from "@/lib/run-summary-view";
import RunSummary from "./RunSummary";
import CsvHelp from "./CsvHelp";
```

(`CreateRun` imports only types from `@ledgerline/core` today, so `tokensForChain` gets its own value import as shown.)

Before `return`, add:

```tsx
  const source = summarySource(step, draft, prepared?.manifest);
  const tokenOrder = Object.values(tokensForChain(net.chain.id)) as string[];
```

Replace the whole `return (…)` with the version below. The step elements inside `<Panel>` are the existing ones, unchanged:

```tsx
  return (
    <Grid dense={!!source}>
      <Col span={12}>
        <Steps className="hide-sm" current={step} items={STEP_TITLES.map((title) => ({ title }))} />
        <p className="only-sm step-line">Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}</p>
      </Col>

      {wrongChain && wallet && (
        <Col span={12}>
          {/* The existing wrong-chain <Alert …/>, unchanged except that its style={{ marginTop: 22 }} is removed. */}
        </Col>
      )}

      {/* First in the DOM, so a phone reads what is about to be signed before
          the Send button; on the right at lg through `start` and dense packing. */}
      {source && draft && (
        <Col start={9} span={4} md={12} sticky>
          <RunSummary
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols)}
            network={net.name}
            payer={source.payer ?? wallet?.address}
          />
        </Col>
      )}

      <Col span={step === 4 ? 12 : 8} md={12}>
        <Panel>
          {/* The existing five `{step === N && …}` blocks, unchanged, without their wrapping <div style={{ marginTop: 28 }}>. */}
        </Panel>
      </Col>

      {step === 0 && (
        <Col span={4} md={12}>
          <CsvHelp />
        </Col>
      )}
    </Grid>
  );
```

As in Task 4, a `{/* … */}` marker means *move the existing element here verbatim*.

- [ ] **Step 8: Verify**

Run: `cd apps/web && pnpm test && pnpm typecheck && pnpm build`
Expected: all pass, clean.

Then `pnpm start --port 3055`, open `/new?n=testnet`, and drop the sample CSV from `CsvHelp` ("Download this sample"; name the run first). On Review:
- at 1280px the summary is to the right of the step and stays in view when you scroll the table;
- at 390px it is above the step content;
- `document.documentElement.scrollWidth - document.documentElement.clientWidth` is `0` at 1024, 768 and 390.

Stop the server. Sending is checked in Task 10.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/run-summary-view.ts apps/web/test/run-summary-view.test.ts apps/web/test/plain-language.test.ts "apps/web/app/(app)/new" apps/web/app/globals.css
git commit -m "feat(web): the create flow beside a sticky summary of exactly what will be signed" -m "On Pay the summary reads the prepared list, its payer and run ID, never the draft. It comes first in the DOM so a phone shows it before the Send button. StepSend changes only its heading level.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `/runs` — panels on the grid

**Files:**
- Modify: `apps/web/app/(app)/runs/RunHistory.tsx`

**Interfaces:**
- Consumes: `Grid`, `Col`, `Panel`, `Verdict` (Task 1).

- [ ] **Step 1: Replace the page frame**

Add imports `import { Grid, Col } from "@/components/grid/Grid";`, `import Panel from "@/components/ui/Panel";`, `import Verdict from "@/components/ui/Verdict";`.

Replace the whole `return (…)` with:

```tsx
  return (
    <Grid>
      {!wallet ? (
        <Col span={12}>
          <Panel>
            <Verdict title="Runs you sent from this browser"
              body="Connect the wallet that paid them. This list lives in this browser only — Ledgerline has no account and no server that remembers you." />
            <Button type="primary" style={{ marginTop: 24 }} onClick={connect}>Connect a wallet</Button>
          </Panel>
        </Col>
      ) : rows.length === 0 ? (
        <Col span={12}>
          <Panel>
            <Verdict title="Nothing recorded for this wallet" body={
              <>
                No runs from <span className="hex addr">{short(wallet.address)}</span> have been sent
                from this browser — or the list was cleared with the site&apos;s data. Neither
                says anything about the chain: a run you sent elsewhere is still there, and
                opening it needs only its transaction hash.
              </>
            } />
            <p style={{ marginTop: 22, marginBottom: 0 }}>
              <Link href="/new">Create a payout run</Link>
              {" · "}
              <a href={`${net.explorer}/address/${wallet.address}`} target="_blank" rel="noreferrer">
                Find an earlier one on the explorer
              </a>
            </p>
          </Panel>
        </Col>
      ) : (
        <>
          <Col span={12}>
            {/* The existing "A shortcut, not a record" <Alert …/>, unchanged except that its style={{ marginTop: 22 }} is removed. */}
          </Col>
          <Col span={12}>
            <Panel title="Runs sent from this browser">
              <Table<RunRecord>
                columns={columns}
                dataSource={rows.map((r) => ({ ...r, key: r.txHash }))}
                pagination={rows.length > 25 ? { pageSize: 25 } : false}
                size="middle"
                scroll={{ x: "max-content" }}
              />
            </Panel>
          </Col>
        </>
      )}
    </Grid>
  );
```

The footer's "Create a payout run" link is removed on purpose: the sidebar and bottom tabs carry New payout.

- [ ] **Step 2: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm test && pnpm build`
Expected: clean, all pass.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/runs/RunHistory.tsx"
git commit -m "feat(web): run history in panels on the grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `/` — hero, example card, three steps

**Files:**
- Modify: `apps/web/app/(public)/page.tsx`, `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `Grid`, `Col`, `Panel` (Task 1). `Panel` uses `useId` inside this Server Component; Task 1 Step 8 established that this builds.

- [ ] **Step 1: Replace the page**

`apps/web/app/(public)/page.tsx`:

```tsx
import Link from "next/link";
import { defaultNetwork } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";

export default function Home() {
  const net = defaultNetwork();
  const testnet = net.name === "testnet";

  return (
    <Grid>
      <Col span={7} md={12}>
        <section className="verdict ok hero">
          <h1>A payment that carries its own invoice</h1>
          <p>
            Pay a list of invoices in USDC, EURC or cirBTC in one transaction on Arc. Each
            payment records which invoice it settles, on chain, so you and the people you pay
            can each check it without a shared spreadsheet — or trusting us.
          </p>
        </section>
        <div className="home-actions">
          <Link href="/new" className="button-primary">Create a payout run</Link>
          <Link href="/dashboard">Open your dashboard</Link>
        </div>
      </Col>

      <Col span={5} md={12}>
        {/* Labelled so it is never read as someone's real payment. */}
        <Panel head={<><strong>Example</strong><span>what a recipient sees</span></>}>
          <section className="line">
            <div>
              <p className="amount">0.10<span className="unit">USDC</span></p>
              <p className="payee">to 0xe48A…732a</p>
            </div>
            <span className="reference">INV-US-001</span>
          </section>
        </Panel>
      </Col>

      {testnet && (
        <Col span={12}>
          <p className="testnet-note">
            This is Arc testnet: tokens here have no value, so nothing you do can lose real
            money. Get test USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>
            {" "}— you need a little USDC for network fees even when paying other tokens.
          </p>
        </Col>
      )}

      <Col span={12}><h2 className="section-title">How a run works</h2></Col>

      <Col span={4} md={12}>
        <Panel className="how-card">
          <span className="how-step">1</span>
          <h3>Upload a list of invoices</h3>
          <p>
            A CSV with one line per payment: invoice, token, recipient, amount.{" "}
            <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download a sample</a>{" "}
            to start from. It stays in your browser.
          </p>
        </Panel>
      </Col>
      <Col span={4} md={12}>
        <Panel className="how-card">
          <span className="how-step">2</span>
          <h3>Check it, then pay in one transaction</h3>
          <p>
            Every payment is tried against the chain before you pay, so a short balance
            or a transfer the token would refuse shows up before any money moves. Then
            one transaction pays every line.
          </p>
        </Panel>
      </Col>
      <Col span={4} md={12}>
        <Panel className="how-card">
          <span className="how-step">3</span>
          <h3>Send each recipient their receipt link</h3>
          <p>
            The link shows what was paid and which invoice it settles, checked against
            the chain in their own browser. They need no account and nothing from us.
          </p>
        </Panel>
      </Col>

      <Col span={12}>
        <p className="how-note">
          Your wallet signs directly, so it must be an ordinary wallet such as MetaMask or
          Rabby. Safe and other smart-contract wallets can&apos;t pay this way on
          Arc.
        </p>
        <footer className="footer home-footer">
          <Link href="/why">How this differs from an ordinary batch payment</Link>
          <span>
            For developers: rebuild any run&apos;s reconciliation with{" "}
            <code>npx arc-reconcile</code>.
          </span>
        </footer>
      </Col>
    </Grid>
  );
}
```

- [ ] **Step 2: CSS for the step cards**

In `apps/web/app/globals.css`, replace the `.how …` rules (the six lines from `.how { margin-top: 3rem; }` through `.how li p …`) with:

```css
.how-card .how-step { display: block; margin-bottom: 8px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 1.35rem; line-height: 1.2; color: var(--success); }
.how-card h3 { font-size: 1rem; font-weight: 600; margin: 0 0 0.35rem; }
.how-card p { margin: 0; color: var(--text-soft); font-size: 0.93rem; }
.hero { padding-top: 0.4rem; }
```

Keep `.how-note`.

- [ ] **Step 3: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: clean.

`pnpm start --port 3055`. Check:
- `curl -s http://localhost:3055/ | grep -o '<h1[^>]*>[^<]*' | wc -l` prints `1`;
- the page shows the hero and the Example card side by side at 1280px, and the three step cards in one row.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(public)/page.tsx" apps/web/app/globals.css
git commit -m "feat(web): the landing page on the grid, its sample line labelled as an example" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `/why` — the comparison and the two transactions

**Files:**
- Modify: `apps/web/app/(public)/why/Why.tsx`

**Interfaces:**
- Consumes: `Grid`, `Col`, `Panel`, `Verdict` (Task 1).

- [ ] **Step 1: Replace the page frame**

Add imports `import { Grid, Col } from "@/components/grid/Grid";`, `import Panel from "@/components/ui/Panel";`, `import Verdict from "@/components/ui/Verdict";`.

Replace the whole `return (…)` of the page component with the version below. Each non-ready phase keeps its current copy, now rendered through `Verdict level={1}`:

```tsx
  return (
    <Grid>
      <Col span={12}>
        <div className="page-head">
          <strong>Why this differs</strong>
          <span>
            Arc {net.name}
            {data ? ` at block ${data.ours.blockNumber.toLocaleString("en-US")}` : ""}
          </span>
        </div>
      </Col>

      {phase === "loading" && <Col span={12}><Panel><Skeleton active paragraph={{ rows: 8 }} /></Panel></Col>}

      {phase === "unconfigured" && (
        <Col span={12}>
          <Panel>
            <Verdict level={1} tone="degraded" title="No pair of transactions to compare yet"
              body="This page reads two real transactions off Arc and derives every claim below from their logs. It asserts nothing on its own, so with no transactions configured it has nothing to say." />
            <p style={{ marginTop: "1.6rem", marginBottom: 0, maxWidth: "62ch" }}>
              Point it at a pair:{" "}
              <code className="hex">/why?ours=0x…&amp;naive=0x…&amp;approve=0x…&amp;n={net.name}</code>
            </p>
          </Panel>
        </Col>
      )}

      {phase === "tx_not_found" && (
        <Col span={12}>
          <Panel>
            <Verdict level={1} tone="error" title={`One of these transactions is not on Arc ${net.name}`}
              body={<>Nothing here matches. If the pair was sent on another network, switch with <code>?n=mainnet</code>.</>} />
          </Panel>
        </Col>
      )}

      {phase === "rpc_unreachable" && (
        <Col span={12}>
          <Panel>
            <Verdict level={1} tone="degraded" title="Could not reach Arc"
              body="This says nothing about either transaction — only that the comparison could not be read. Try another endpoint below." />
            {error && <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} />}
          </Panel>
        </Col>
      )}

      {phase === "ready" && data && <Comparison data={data} net={net} />}

      <Col span={12}>
        <footer className="footer">
          <div>
            Read from <span className="endpoint">{rpc}</span>{" "}
            <button className="linkish" onClick={() => {
              const next = window.prompt("Arc RPC endpoint to read from", rpc);
              if (next) setRpc(next.trim());
            }}>change</button>
          </div>
        </footer>
      </Col>
    </Grid>
  );
```

In `Comparison`'s rows, change every `var(--tick)` to `var(--success)` and every `var(--flag)` to `var(--danger)`.

Replace `Comparison`'s `return (…)` with:

```tsx
  return (
    <>
      <Col span={12}>
        <Panel>
          {/* The existing <section className="line line--summary">…</section>, unchanged. */}
          {/* The existing reverted <Alert …/> (when reverted.length > 0), unchanged. */}
          <Verdict level={1} tone="ok" title="The reference is the difference"
            body={`Both transactions below moved real money on Arc ${net.name}. Every claim in the table is read from their logs when this page loads — nothing here is asserted by us.`} />
          <div style={{ marginTop: 20 }}>
            <Table<ClaimRow> columns={columns} dataSource={rows} pagination={false} size="middle"
              scroll={{ x: "max-content" }} />
          </div>
        </Panel>
      </Col>

      <Col span={6} md={12}>
        {/* The existing "Ledgerline" <TxCard …>…</TxCard>, unchanged. */}
      </Col>
      <Col span={6} md={12}>
        {/* The existing "Ordinary Multicall3 batch" <TxCard …>…</TxCard>, unchanged. */}
      </Col>

      <Col span={12}>
        {/* The existing "What this comparison does not claim" <Alert …/>, unchanged except that its style={{ marginTop: 26 }} is removed. */}
      </Col>
    </>
  );
```

`{/* … */}` markers mean *move the existing element here verbatim*. The `<div className="compare">` wrapper is deleted.

Replace `TxCard`'s body with a Panel:

```tsx
  return (
    <Panel title={title}>
      <p className="because" style={{ marginTop: 0 }}>{note}</p>
      <p style={{ margin: "0.9rem 0" }}>
        <a className="hex" href={`${net.explorer}/tx/${side.hash}`} target="_blank" rel="noreferrer">
          {side.hash}
        </a>
      </p>
      {children}
    </Panel>
  );
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm test && pnpm build`
Expected: clean, all pass.

`pnpm start --port 3055`. Open `/why?n=testnet`. Check:
- the table sits in one panel, with the two transaction panels side by side at 1280px and stacked at 768px;
- `document.querySelectorAll("h1").length` is `1`.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(public)/why/Why.tsx"
git commit -m "feat(web): the comparison page in panels, the two transactions side by side" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Remove the aliases and the dead classes, and guard them

**Files:**
- Modify: `apps/web/app/globals.css`, `apps/web/test/no-legacy-css.test.ts`

- [ ] **Step 1: Write the failing guard**

Add to the `describe` in `apps/web/test/no-legacy-css.test.ts`:

```ts
  it("no page uses a pre-redesign colour name", () => {
    // --raised is a real token (raised), not one of these aliases.
    expect(hits(/--(ground|ink|ink-soft|rule|ruleStrong|tick|flag|pending)(?![\w-])/)).toEqual([]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run test/no-legacy-css.test.ts`
Expected: FAIL, listing every remaining alias line in `app/globals.css` (and nowhere else — Tasks 4 and 8 removed the inline ones; if a `.tsx` line is listed, fix it the same way).

- [ ] **Step 3: Replace every alias in `globals.css` with its token**

Apply this mapping to each line the guard listed:

| Alias | Becomes | Except |
|---|---|---|
| `--ground` | `--bg` | `.button-primary` text → `--on-accent` |
| `--ink` | `--text` | |
| `--ink-soft` | `--text-soft` | |
| `--rule` | `--border` | `.wallet-list button` border → `--control` (a control boundary, part 1 §5.1) |
| `--ruleStrong` | `--text` | `.line`'s `var(--ruleStrong, var(--ink))` → `var(--text)` |
| `--tick` | `--success` | `.linkish` colour → `--link`; `.button-primary` background → `--accent`; `.wallet-list button:hover` border → `--link` |
| `--flag` | `--danger` | |
| `--pending` | `--warning` | |

Also:
- `.button-primary:hover { background: var(--ink); color: var(--ground); }` becomes `.button-primary:hover { background: var(--link); color: var(--on-accent); }`.
- The link underline at the top, `a { … text-decoration-color: var(--rule); }`, becomes `text-decoration-color: currentColor;`. Links are told apart from text by their underline (part 1 §5.1), and at `--border` contrast the underline was close to invisible.
- Delete the alias block (the `:root { --ground: …; … --pending: …; }` block and the comment above it), keeping `--measure: 62ch;` in a `:root { }` of its own.

- [ ] **Step 4: Find and delete dead classes**

Run from `apps/web`:

```bash
node -e '
const fs=require("fs"),path=require("path");
const walk=d=>fs.readdirSync(d).flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()?walk(p):/\.tsx?$/.test(f)?[fs.readFileSync(p,"utf8")]:[]});
const src=["app","components","lib"].flatMap(walk).join("\n");
const css=fs.readFileSync("app/globals.css","utf8");
const names=[...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1]))].filter(n=>!n.startsWith("ant-"));
console.log(names.filter(n=>!new RegExp("(^|[^\\w-])"+n.replace(/-/g,"\\-")+"([^\\w-]|$)").test(src)).join("\n"));'
```

It prints the class names no source file mentions. Some classes are built at runtime and so never appear literally in the source. **Keep these:**
- `ok`, `error`, `critical`, `degraded` (from `verdict ${tone}`)
- `pass`, `fail`, `skipped` (from `rung ${r.status}`)
- `funding-ok`, `funding-short`, `funding-unknown` (from `funding-${r.state}`)
- `is-success`, `is-warning`, `is-danger` (from `is-${tone}`)
- `is-dense`, `is-sticky`, `is-test`, `is-void`, `is-absent`

Also ignore names the regex picked out of CSS comments or file names, such as `ts` from `lib/grid.ts`. Delete the rules for every other printed name. Expected, among others: `sheet`, `sheet--wide`, `masthead`, `compare`, `card`, `card-title`, `network--test`, `how`. Delete a whole rule only when every selector in it is dead; in a selector list, remove just the dead selector.

- [ ] **Step 5: Verify**

Run: `cd apps/web && pnpm test && pnpm typecheck && pnpm build`
Expected: all pass, including both guards; clean; build succeeds.

`pnpm start --port 3055`. Load `/`, `/why?n=testnet`, `/dashboard`, `/runs`, `/new` in both themes (set cookie `theme=dark`, then `theme=light`). Expected: no element renders in the browser's default black/blue or transparent-on-transparent. That would mean a variable left unset, and axe in Task 10 would also catch it. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/globals.css apps/web/test/no-legacy-css.test.ts
git commit -m "refactor(web): retire the pre-redesign colour aliases and the classes no page uses" -m "Every alias now names its token. Where the alias hid a wrong meaning it is corrected: the text button is a link colour, the primary link button the accent, a wallet choice's edge a control boundary, and link underlines are visible. A guard test fails if an alias comes back.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verify in a real browser, with a real testnet run

No new code unless a check fails. A failure is fixed in the task that owns the code, pinned by a test where possible, committed with a message naming the check that caught it, and then this task is re-run from Step 1.

**Files:** none (evidence only). Screenshots go in the session scratchpad, not the repo.

- [ ] **Step 1: Build and serve**

Run: `cd apps/web && pnpm build && pnpm start --port 3055` in the background. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:3055/` prints `200`.

- [ ] **Step 2: A signer and a wallet**

Run a local signer holding `PRIVATE_KEY` from the repo `.env`, in its own Node process. It answers only `eth_requestAccounts`, `eth_accounts`, `personal_sign` and `eth_sendTransaction`, with `Access-Control-Allow-Origin: http://localhost:3055` (never `*`). In the Playwright page, inject an EIP-6963 provider that forwards those four methods to it, answers `eth_chainId` with testnet (`0x4cef52`, chain 5042002), and sends every other request to `https://rpc.testnet.arc.io`.

- [ ] **Step 3: A real run through the migrated `/new`**

On `/new?n=testnet`, name the run `Part3 check <timestamp>` and upload a two-line CSV:

```
invoiceId,token,to,amount
P3-USD-1,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.1
P3-EUR-1,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.1
```

Expected, in order:
- On Review, the summary reads `2 payments`, `0.1 USDC`, `0.1 EURC`, `Arc testnet`, and the signer's short address.
- On Check, after signing, the checks pass.
- On Pay, the summary shows a `Run ID`. **While the transaction is being sent**, the top bar's disconnect is disabled (open the wallet menu and read the item's `aria-disabled`).
- On Receipts, "Paid, with a receipt". Download the run file (keep it for Step 6).
- Open one receipt link in a fresh browser context with no provider injected. It reads **Verified**, every check ✓ (5/5).

- [ ] **Step 4: A wallet change never shows stale figures**

Start a second run with the same CSV and stop on Review. Emit `accountsChanged` with a different address from the provider.
Expected: the summary's Paying wallet shows the new address, or the flow returns to Review (CreateRun's existing reset). It never shows a run ID or figures for the first address after the change.

- [ ] **Step 5: The run page and the dashboard agree**

Open `/run/<txHash from Step 3>?n=testnet`. Expected:
- Payments `2`, with `0.1 USDC` and `0.1 EURC`;
- Completeness `Complete`;
- Recorded has a block and an explorer link.

Open `/dashboard?n=testnet`. Expected: that run's Paid cell reads `0.1 USDC · 0.1 EURC`.

- [ ] **Step 6: An owed cirBTC line has cirBTC's decimals**

Edit a copy of the Step 3 run file:
- add an item `{"invoiceId":"P3-BTC-1","token":"<testnet cirBTC address from tokensForChain(5042002).cirBTC>","to":"0xe48A096B9E74f064b13c17734af29F85E02d732a","amount":"12345678"}`;
- give `items` a length that no longer matches the recorded list.

On the run page, use "Load the run file" with the edited copy.
Expected: an unpaid row for `P3-BTC-1` whose owed amount reads `owed 0.12345678` (8 decimals), not `owed 12.345678`. The run-file alert may say it does not match the recorded list. That is expected and not what this step checks.

- [ ] **Step 7: axe, overflow and screenshots**

For each route below, in both themes (cookie `theme=dark`, then `theme=light`):
- `/`
- `/why?n=testnet`
- `/r/<a Step 3 receipt link>`
- `/dashboard?n=testnet` (connected)
- `/runs?n=testnet` (connected)
- `/run/<txHash>?n=testnet`
- `/new?n=testnet`, on Review with the Step 3 CSV

do the following:
- inject axe (`.playwright-mcp/axe.min.js`) and run `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })`. Expected: no `serious` or `critical` violations.
- at widths 390, 768, 1024 and 1280, compute `document.documentElement.scrollWidth - document.documentElement.clientWidth`. Expected: `0`.
- take a screenshot at 390 and 1280.

Expected: `browser_console_messages` at level `error` is empty on every route.

- [ ] **Step 8: Keyboard and headings**

On `/run/<txHash>` and `/new` (Review), Tab through the page. Expected: every link and button inside a Panel, a StatTile and the run summary shows a visible focus ring.

On each app route, check `document.querySelectorAll("h1").length`. Expected: `1` (the top bar's).

- [ ] **Step 9: Stop and run everything**

Stop the signer and the server (`kill $(lsof -tiTCP:3055 -sTCP:LISTEN)`, and the same for the signer's port). From the repo root run `pnpm test && pnpm typecheck`.
Expected: every package passes; typecheck clean.

Record the results of Steps 3–8 (tx hash, receipt verdict, axe counts, overflow numbers, screenshot paths) in the final report to the user.
