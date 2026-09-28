# Home Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the repeated receipt, fix the phone comparison and heading outline, make the footer a full-width band that ends the page, and add the only two motions the spec allows: chapters that follow the demo video, and the example receipt printing in once.

**Architecture:** Pure data and functions in `frontend/lib/` (chapter starts, `chapterAt`, `showsSiteFooter`) carry every decision that can be unit-tested. The footer moves from the two pages into `PublicShell`, after `<main>`. `DemoVideo` drives the chapter rail and feed line from the `<video>` element's own events and one `requestAnimationFrame` loop. The print-in is CSS only.

**Tech Stack:** Next.js 16 App Router, React 19, antd 6 (untouched here), vitest 2, Playwright 1.62.1 (root devDependency), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-09-28-home-polish-design.md` (amends `2026-09-24-tape-design-system-design.md` §7.1, §7.4, §8). Read both.

## Global Constraints

- Colours only from existing tokens (`--desk`, `--desk-deep`, `--tape`, `--tape-shade`, `--rule`, `--control`, `--ink`, `--ink-soft`, `--highlight`, `--on-highlight`). No new colour.
- Radius 0 everywhere. Lines: `1.5px dashed ink` section rule, `1.5px dotted rule` separators, `1px solid rule` shell dividers.
- Motion: only §4.1 (chapters + feed line) and §4.2 (print-in). No hover lifts, no page transitions, no scroll reveals, no count-ups.
- Under `prefers-reduced-motion: reduce`, both motions are static.
- Chapter labels, exactly: `Upload`, `Review`, `Check`, `Pay`, `Receipt`.
- Posters stay 1920×1080 (wide) and 840×1050 (phone), same file names.
- No new testnet runs and no re-recording.
- Public copy passes `frontend/test/plain-language.test.ts` (no "anchor", "salt", "manifest", "root", "commit…", "preflight", "merkle", "run label").
- `/r/<tx>` has no site footer.
- Every chapter button at least 24×24 CSS px (WCAG 2.5.8).
- Commit after each task; never push. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A chapter pressed before the video ever loaded** (reduced motion, `preload="none"`): the seek must land on that chapter, not at 0 — Task 8, "early chapter press".
2. **Width or theme changes mid-play**: the rail must follow the new clip's chapters, never the old clip's highlight — Task 8, "clip switch".
3. **Keyboard**: a chapter is reachable by Tab, Enter seeks, focus stays on the pressed chapter — Task 8, "keyboard chapters".
4. **`/why?n=testnet`**: the footer names the same network as the header badge — Task 8, "footer network".
5. **A 320px phone**: the five-column chapter grid fits with no horizontal scroll and every button ≥ 24px — Task 8, "320px".

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/site-footer.ts` | modify | + `showsSiteFooter(pathname)` |
| `frontend/test/site-footer.test.ts` | modify | its tests |
| `frontend/components/shell/PublicShell.tsx` | modify | renders the footer after `<main>` |
| `frontend/components/ui/SiteFooter.tsx` | modify | a band, not a tape |
| `frontend/app/(public)/page.tsx` | modify | footer out; h2 heads; comparison list; example tape class |
| `frontend/app/(public)/why/Why.tsx` | modify | footer out |
| `frontend/app/styles/pages.css` | modify | footer band; comparison list; chapter rail; feed line; print-in |
| `frontend/app/styles/tape.css` | modify | `.tape-head-title` |
| `frontend/lib/demo-run.ts` | modify | `DEMO_STEPS`, `chapters`, `duration`, `posterAt`, `chapterAt`, `DEMO_BRIDGE` |
| `frontend/test/demo-run.test.ts` | modify | chapter and poster tests |
| `frontend/test/plain-language.test.ts` | modify | `DEMO_BRIDGE` case |
| `docs/notes/2026-09-28-demo-video.md` | modify | chapters table; poster wording |
| `frontend/public/demo/run-*.jpg` | replace | Check-step posters |
| `scripts/lib/timeline.ts` | create | frame timeline → output time |
| `scripts/lib/timeline.test.ts` | create | its tests |
| `scripts/record-demo.ts` | modify | prints chapters, takes the Check poster |
| `frontend/components/ui/DemoVideo.tsx` | modify | rail, feed line, bridge sentence |
| `docs/superpowers/specs/2026-09-24-tape-design-system-design.md` | modify | pointers in §7.1, §7.4, §8 |
| `docs/superpowers/specs/2026-09-28-home-polish-design.md` | modify | feed line: `translateX`, not `scaleX` (Task 6 note) |

Commands used throughout (run from the repo root unless stated):

- Unit tests: `pnpm --filter @ledgerline/web exec vitest run <file>`
- All web tests: `pnpm --filter @ledgerline/web test`
- Typecheck: `pnpm --filter @ledgerline/web typecheck`
- Build: `pnpm build`
- Serve: `(cd frontend && npx next start -p 3100)` in the background

---

### Task 1: The footer becomes a band that ends the page

**Files:**
- Modify: `frontend/lib/site-footer.ts`
- Modify: `frontend/test/site-footer.test.ts`
- Modify: `frontend/components/shell/PublicShell.tsx`
- Modify: `frontend/components/ui/SiteFooter.tsx`
- Modify: `frontend/app/(public)/page.tsx` (last `<Col>` and the `SiteFooter` import)
- Modify: `frontend/app/(public)/why/Why.tsx` (last `<Col>` and the `SiteFooter` import)
- Modify: `frontend/app/styles/pages.css` (site footer section)

**Interfaces:**
- Produces: `showsSiteFooter(pathname: string | null): boolean` in `@/lib/site-footer`.
- Consumes: `networkFromSearch(search)` from `@/lib/use-network` (exists).

- [ ] **Step 1: Write the failing test**

Append to `frontend/test/site-footer.test.ts` (and add `showsSiteFooter` to its import from `@/lib/site-footer`):

```ts
describe("showsSiteFooter", () => {
  it("ends the home page and /why", () => {
    expect(showsSiteFooter("/")).toBe(true);
    expect(showsSiteFooter("/why")).toBe(true);
  });

  it("leaves a receipt and the app pages without it", () => {
    for (const p of ["/r/0xabc", "/new", "/dashboard", "/runs", "/run/0xabc", "/whyever", null]) {
      expect(showsSiteFooter(p), String(p)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/site-footer.test.ts`
Expected: FAIL — `showsSiteFooter` is not exported.

- [ ] **Step 3: Implement `showsSiteFooter`**

Append to `frontend/lib/site-footer.ts`:

```ts
/** The pages that end in the site footer (home polish spec §3.5): the home
 *  page and /why. A recipient on /r needs only their receipt. */
const FOOTER_PATHS = new Set(["/", "/why"]);

export function showsSiteFooter(pathname: string | null): boolean {
  return pathname !== null && FOOTER_PATHS.has(pathname);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @ledgerline/web exec vitest run test/site-footer.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Render the footer from the shell**

In `frontend/components/shell/PublicShell.tsx`, change the navigation import and add two imports:

```tsx
import { usePathname, useSearchParams } from "next/navigation";
import { networkFromSearch } from "@/lib/use-network";
import { showsSiteFooter } from "@/lib/site-footer";
import SiteFooter from "@/components/ui/SiteFooter";
```

Inside the component, under `const search = useSearchParams();`:

```tsx
  const pathname = usePathname();
```

After the closing `</main>` and before the closing `</div>`:

```tsx
      {/* After <main>, so it is the page's contentinfo landmark. It follows
          ?n= like the NetworkBadge above, so the two always agree. */}
      {showsSiteFooter(pathname) && <SiteFooter network={networkFromSearch(search).name} />}
```

- [ ] **Step 6: Make `SiteFooter` a band**

In `frontend/components/ui/SiteFooter.tsx`:

1. Delete `import Tape from "@/components/ui/Tape";`.
2. Replace the doc comment above the component with:

```tsx
/**
 * The end of / and /why (home polish spec §3.5): a full-width band like the
 * header, its content in the same frame. PublicShell renders it after <main>,
 * so it is the page's contentinfo landmark. Not on /r — a recipient needs
 * only their receipt.
 *
 * Takes the network's name, not its view: viem's chain object carries
 * functions that cannot cross from a server component into this one.
 */
```

3. Replace the whole `return (...)` with:

```tsx
  return (
    <footer className="site-footer">
      <div className="frame">
        <div className="tape-head">
          <strong className="brand-inline"><Mark size={11} /> Ledgerline</strong>
          <span>Arc {net.name} · chain {net.chain.id}</span>
        </div>
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
      </div>
    </footer>
  );
```

- [ ] **Step 7: Take the footer out of the two pages**

In `frontend/app/(public)/page.tsx` delete `import SiteFooter from "@/components/ui/SiteFooter";` and delete this block at the end of the grid:

```tsx
      <Col span={12}>
        <SiteFooter network={net.name} />
      </Col>
```

Do the same in `frontend/app/(public)/why/Why.tsx` (the import on line 16 and the same `<Col>` block near line 149).

- [ ] **Step 8: Style the band**

In `frontend/app/styles/pages.css`, replace the section heading comment `/* ── site footer: the end of the roll (spec §7.4) ─────…── */` with the following block, keeping every existing `.brand-inline`, `.site-footer-*`, `.command*` rule below it unchanged:

```css
/* ── site footer: the page's end, a band like the header (home polish §3.5) ── */
.site-footer {
  background: var(--desk-deep);
  border-top: 1px solid var(--rule);
  padding-block: 40px 48px;
}
@media (max-width: 639px) { .site-footer { padding-block: 32px 40px; } }
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter @ledgerline/web typecheck && pnpm --filter @ledgerline/web test`
Expected: tsc exits 0; all tests pass.

Run: `pnpm build`, then serve, then:

```bash
curl -s http://localhost:3100/ | grep -c 'class="site-footer"'          # 1
curl -s http://localhost:3100/why | grep -c 'class="site-footer"'       # 1
curl -s http://localhost:3100/ | grep -o '</main>.\{0,80\}'             # <footer class="site-footer"> follows </main>
```

The landmark itself is checked in a browser in Task 8. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/site-footer.ts frontend/test/site-footer.test.ts frontend/components/shell/PublicShell.tsx frontend/components/ui/SiteFooter.tsx "frontend/app/(public)/page.tsx" "frontend/app/(public)/why/Why.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): the footer is a full-width band after <main>, on / and /why

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Section heads are h2

**Files:**
- Modify: `frontend/app/(public)/page.tsx` (three `Tape head` props)
- Modify: `frontend/app/styles/tape.css` (printed header rules, ~line 48)

- [ ] **Step 1: Change the three heads**

In `frontend/app/(public)/page.tsx`:

```tsx
<Tape head={<><strong>Watch a run</strong><span className="hl">Arc testnet</span></>}>
```
becomes
```tsx
<Tape head={<><h2 className="tape-head-title">Watch a run</h2><span className="hl">Arc testnet</span></>}>
```

```tsx
<Tape head={<><strong>How a run works</strong><span>3 steps · one transaction</span></>}>
```
becomes
```tsx
<Tape head={<><h2 className="tape-head-title">How a run works</h2><span>3 steps · one transaction</span></>}>
```

and in the Proof tape, `<strong>Proof · Arc mainnet</strong>` becomes `<h2 className="tape-head-title">Proof · Arc mainnet</h2>`.

Leave the hero's `<strong>Payment advice</strong>` as it is: it is an illustration, not a section.

- [ ] **Step 2: Style them exactly as the `<strong>` was**

In `frontend/app/styles/tape.css`, replace

```css
:is(.tape-head, .page-head) strong { color: var(--ink); font-weight: 700; letter-spacing: 0.1em; }
```

with

```css
:is(.tape-head, .page-head) :is(strong, .tape-head-title) { color: var(--ink); font-weight: 700; letter-spacing: 0.1em; }
/* A section's head as a real h2, printed exactly like the <strong> heads. */
.tape-head-title { margin: 0; font: inherit; font-weight: 700; }
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @ledgerline/web typecheck` → exit 0.
Build, serve, and run:

```bash
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://localhost:3100/");
  console.log(await p.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].map((h) => h.tagName + " " + h.textContent.trim().slice(0, 30)).join("\n")));
  await p.addScriptTag({ path: ".playwright-mcp/axe.min.js" });
  console.log(await p.evaluate(async () => (await axe.run(document, { runOnly: ["heading-order"] })).violations.length));
  await b.close();
})();'
```

Expected: `H2 Watch a run`, `H2 How a run works`, the three `H3` steps, `H2 Proof · Arc mainnet`, `H3 The same payment, the ordinary way`, then the footer's two `H2`; last line `0`. Take a screenshot of the Proof head at 1440 and compare with the one before the change: no visible difference. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(public)/page.tsx" frontend/app/styles/tape.css
git commit -m "fix(web): the home page's section heads are h2, so its outline no longer skips a level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The comparison is a list on a phone

**Files:**
- Modify: `frontend/app/(public)/page.tsx` (the `versus` section, after `</table>`)
- Modify: `frontend/app/styles/pages.css` (after the `.versus-links` rule)

- [ ] **Step 1: Render the list beside the table**

In `frontend/app/(public)/page.tsx`, directly after the closing `</table>` of `versus-table`, add:

```tsx
            {/* Below 640px the table's three columns wrap every cell; the same
                rows as a list instead (home polish spec §3.2). */}
            <dl className="versus-list">
              {controlComparison().map((r) => (
                <div key={r.key}>
                  <dt>{r.claim}</dt>
                  <dd><span className="label">Ledgerline</span><span className="versus-val">{r.ours}</span></dd>
                  <dd><span className="label">Standard batch</span><span className="versus-val">{r.ordinary}</span></dd>
                  {r.same && <dd className="because">No difference here.</dd>}
                </div>
              ))}
            </dl>
```

- [ ] **Step 2: Show one form per width**

In `frontend/app/styles/pages.css`, after `.versus-links { margin-top: 10px; }`, add:

```css
/* One form per width, by media query: the only-sm utility sets inline-flex,
   which is wrong for a list. */
.versus-list { display: none; margin: 12px 0 0; }
.versus-list > div { padding: 10px 0; border-top: 1.5px dotted var(--rule); }
.versus-list > div:last-child { border-bottom: 1.5px dotted var(--rule); }
.versus-list dt { margin-bottom: 4px; font-size: 14px; }
.versus-list dd { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 0; }
.versus-list dd.because { display: block; }
.versus-val { font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 13px; font-weight: 600; text-align: right; }
.versus-list dd + dd .versus-val { color: var(--ink-soft); }
@media (max-width: 639px) {
  .versus-table { display: none; }
  .versus-list { display: block; }
}
```

- [ ] **Step 3: Verify**

Typecheck → exit 0. Build, serve, then at 390×844 and at 1440×900 read `getComputedStyle(...).display` of `.versus-table` and `.versus-list`:

- 390: table `none`, list `block`.
- 1440: table `table`, list `none`.

Screenshot the Proof tape at 390 and check "2 — an approval, then the batch" sits on one line beside its label. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(public)/page.tsx" frontend/app/styles/pages.css
git commit -m "fix(web): on a phone the comparison with an ordinary batch is a list, not a cramped table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chapter data, Check-step posters and the bridge sentence

**Files:**
- Modify: `frontend/lib/demo-run.ts`
- Modify: `frontend/test/demo-run.test.ts`
- Modify: `frontend/test/plain-language.test.ts`
- Modify: `docs/notes/2026-09-28-demo-video.md`
- Replace: `frontend/public/demo/run-wide-light.jpg`, `run-wide-dark.jpg`, `run-phone-light.jpg`, `run-phone-dark.jpg`

**Interfaces:**
- Produces (in `@/lib/demo-run`):
  - `DEMO_STEPS: readonly ["Upload", "Review", "Check", "Pay", "Receipt"]`
  - `DemoClip` gains `chapters: readonly number[]` (seconds, five starts), `duration: number` (seconds), `posterAt: number` (seconds)
  - `chapterAt(starts: readonly number[], t: number): number` — index of the last start `<= t`; `0` for `t` before the first
  - `DEMO_BRIDGE: string`

The measured values (spec §4.1; each start was checked by extracting the frame just after it — the caption reads that step; each poster time shows "Every payment would go through" with four ✓):

| Clip | chapters | duration | posterAt |
|---|---|---|---|
| wide light | 0, 4.2, 9.833, 16.367, 23.867 | 30.467 | 15.8 |
| wide dark | 0, 4.233, 9.967, 16.433, 24.233 | 30.767 | 15.9 |
| phone light | 0, 4.267, 12.167, 18.833, 26.667 | 33.067 | 18.2 |
| phone dark | 0, 4.267, 12.033, 18.667, 26.567 | 33.0 | 18.0 |

- [ ] **Step 1: Write the failing tests**

In `frontend/test/demo-run.test.ts`, change the import to:

```ts
import { DEMO_RUN as D, DEMO_STEPS, WIDE_QUERY, chapterAt, demoClip } from "@/lib/demo-run";
```

and append:

```ts
describe("chapters", () => {
  for (const layout of LAYOUTS) for (const mode of MODES) {
    const clip = D.clips[layout][mode];
    const name = `${layout}, ${mode}`;

    it(`${name}: one start per step, from 0, increasing, inside the video`, () => {
      expect(clip.chapters).toHaveLength(DEMO_STEPS.length);
      expect(clip.chapters[0]).toBe(0);
      for (let i = 1; i < clip.chapters.length; i++) {
        expect(clip.chapters[i]!).toBeGreaterThan(clip.chapters[i - 1]!);
      }
      expect(clip.chapters.at(-1)!).toBeLessThan(clip.duration);
    });

    it(`${name}: the poster is a frame from the Check chapter`, () => {
      expect(clip.posterAt).toBeGreaterThanOrEqual(clip.chapters[2]!);
      expect(clip.posterAt).toBeLessThan(clip.chapters[3]!);
    });

    it(`${name}: the note carries the same starts, poster and length`, () => {
      const row = [name, ...clip.chapters.map((c) => c.toFixed(3)), clip.posterAt.toFixed(1), clip.duration.toFixed(3)];
      expect(NOTE).toContain(`| ${row.join(" | ")} |`);
    });
  }

  it("are labelled as the captions burned into the video", () => {
    expect(DEMO_STEPS).toEqual(["Upload", "Review", "Check", "Pay", "Receipt"]);
  });
});

describe("chapterAt", () => {
  const starts = [0, 4.2, 9.833, 16.367, 23.867];

  it("is the last chapter that has started", () => {
    expect(chapterAt(starts, 0)).toBe(0);
    expect(chapterAt(starts, 4.199)).toBe(0);
    expect(chapterAt(starts, 4.2)).toBe(1);
    expect(chapterAt(starts, 9.9)).toBe(2);
    expect(chapterAt(starts, 16.366)).toBe(2);
    expect(chapterAt(starts, 16.367)).toBe(3);
    expect(chapterAt(starts, 23.867)).toBe(4);
  });

  it("stays on the first before it and on the last after the end", () => {
    expect(chapterAt(starts, -1)).toBe(0);
    expect(chapterAt(starts, 999)).toBe(4);
  });
});
```

In `frontend/test/plain-language.test.ts`, add `import { DEMO_BRIDGE } from "@/lib/demo-run";` with the other imports, and inside the `describe("copy a payer or recipient reads is free of protocol jargon", …)` block add:

```ts
  it("the home page's demo description", () => {
    clean(DEMO_BRIDGE);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/demo-run.test.ts test/plain-language.test.ts`
Expected: FAIL — `DEMO_STEPS`, `chapterAt`, `DEMO_BRIDGE` are not exported.

- [ ] **Step 3: Add the data and functions**

In `frontend/lib/demo-run.ts`:

1. Replace the `poster` doc comment in `DemoClip` and add three fields:

```ts
export interface DemoClip {
  src: string;
  /** A frame from the Check chapter: "Every payment would go through". The
   *  hero's example already shows what a recipient sees. */
  poster: string;
  width: number;
  height: number;
  txHash: `0x${string}`;
  block: number;
  /** The receipt the video ends on, on this site. */
  receipt: string;
  /** Where each of DEMO_STEPS starts, in seconds — measured from the caption
   *  strip of the file, recorded in the demo note. */
  chapters: readonly number[];
  /** The file's length, in seconds. */
  duration: number;
  /** Where the poster was taken from, in seconds. */
  posterAt: number;
}
```

2. Under `export type DemoLayout …`, add:

```ts
/** The chapters, named exactly as the captions burned into every recording. */
export const DEMO_STEPS = ["Upload", "Review", "Check", "Pay", "Receipt"] as const;

/** Why a testnet video sits above a mainnet proof. */
export const DEMO_BRIDGE =
  "Recorded on Arc testnet. The same flow, measured on mainnet, is under Proof below.";
```

3. Add the three fields to each clip object:

```ts
// clips.wide.light
        chapters: [0, 4.2, 9.833, 16.367, 23.867], duration: 30.467, posterAt: 15.8,
// clips.wide.dark
        chapters: [0, 4.233, 9.967, 16.433, 24.233], duration: 30.767, posterAt: 15.9,
// clips.phone.light
        chapters: [0, 4.267, 12.167, 18.833, 26.667], duration: 33.067, posterAt: 18.2,
// clips.phone.dark
        chapters: [0, 4.267, 12.033, 18.667, 26.567], duration: 33.0, posterAt: 18.0,
```

4. Append:

```ts
/** The chapter showing at `t` seconds: the last one that has started. */
export function chapterAt(starts: readonly number[], t: number): number {
  let at = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i]! <= t) at = i;
  return at;
}
```

- [ ] **Step 4: Record the chapters in the note**

In `docs/notes/2026-09-28-demo-video.md`:

1. In `## Files`, replace the sentence "The poster is each video's last frame, the verified receipt." with "The poster is a frame from the Check chapter, at the time in the table below."
2. Add this section before `## Re-recording`:

```markdown
## Chapters

Where each step starts, in seconds, found by scene detection on each file's
caption strip (bottom 108px wide, 132px phone; ffmpeg
`select='gt(scene,0.02)'`) and confirmed by the frame just after each start
[measured]. The poster is taken at the time shown, inside the Check chapter.
The caption's change from "4 · Pay" to "4 · Paid" is inside the Pay chapter
and is not a chapter.

| Recording | Upload | Review | Check | Pay | Receipt | Poster | Length |
|---|---|---|---|---|---|---|---|
| wide, light | 0.000 | 4.200 | 9.833 | 16.367 | 23.867 | 15.8 | 30.467 |
| wide, dark | 0.000 | 4.233 | 9.967 | 16.433 | 24.233 | 15.9 | 30.767 |
| phone, light | 0.000 | 4.267 | 12.167 | 18.833 | 26.667 | 18.2 | 33.067 |
| phone, dark | 0.000 | 4.267 | 12.033 | 18.667 | 26.567 | 18.0 | 33.000 |
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm --filter @ledgerline/web exec vitest run test/demo-run.test.ts test/plain-language.test.ts`
Expected: PASS.

- [ ] **Step 6: Replace the posters**

```bash
cd frontend/public/demo
ffmpeg -y -loglevel error -ss 15.8 -i run-wide-light.mp4  -frames:v 1 -q:v 3 run-wide-light.jpg
ffmpeg -y -loglevel error -ss 15.9 -i run-wide-dark.mp4   -frames:v 1 -q:v 3 run-wide-dark.jpg
ffmpeg -y -loglevel error -ss 18.2 -i run-phone-light.mp4 -frames:v 1 -q:v 3 run-phone-light.jpg
ffmpeg -y -loglevel error -ss 18.0 -i run-phone-dark.mp4  -frames:v 1 -q:v 3 run-phone-dark.jpg
cd -
```

Open each of the four JPGs and confirm by eye: the "*** Every payment would go through ***" heading, four ✓ lines (Record the list on chain, INV-US-001, INV-EU-002, INV-BTC-003), and the "3 · Check" caption.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm --filter @ledgerline/web test`
Expected: PASS (the existing poster-size test still passes: 1920×1080 and 840×1050).

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/demo-run.ts frontend/test/demo-run.test.ts frontend/test/plain-language.test.ts docs/notes/2026-09-28-demo-video.md frontend/public/demo/*.jpg
git commit -m "feat(web): the demo's chapters, measured from each recording, and posters from the Check step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The recording script prints chapters and takes the Check poster

The script cannot be run without spending testnet funds, so the timeline arithmetic moves into a pure module with its own test; the script is then typechecked, not re-run.

**Files:**
- Create: `scripts/lib/timeline.ts`
- Create: `scripts/lib/timeline.test.ts`
- Modify: `scripts/record-demo.ts` (`caption` helper ~line 239, the Check step ~line 305, `record()`'s tail ~line 353, `encode()` ~line 364)

**Interfaces:**
- Produces: `buildTimeline(frames: { at: number }[], end: number, speedAt: (t: number) => number): { durations: number[]; outputTime(t: number): number }` in `scripts/lib/timeline.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline.js";

const frames = [{ at: 10 }, { at: 11 }, { at: 12 }];

describe("buildTimeline", () => {
  it("keeps real time when nothing is sped up", () => {
    const t = buildTimeline(frames, 13, () => 1);
    expect(t.durations).toEqual([1, 1, 1]);
    expect(t.outputTime(10)).toBe(0);
    expect(t.outputTime(11.5)).toBeCloseTo(1.5);
    expect(t.outputTime(13)).toBeCloseTo(3);
  });

  it("compresses a wait by its speed", () => {
    const t = buildTimeline(frames, 13, (s) => (s >= 11 && s < 12 ? 4 : 1));
    expect(t.durations).toEqual([1, 0.25, 1]);
    expect(t.outputTime(11.5)).toBeCloseTo(1.125);
    expect(t.outputTime(12.5)).toBeCloseTo(1.75);
  });

  it("puts anything before the first frame at the start", () => {
    expect(buildTimeline(frames, 13, () => 1).outputTime(3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run scripts/lib/timeline.test.ts`
Expected: FAIL — cannot find `./timeline.js`.

- [ ] **Step 3: Implement**

Create `scripts/lib/timeline.ts`:

```ts
/**
 * Where a moment of the recording lands in the encoded video. Each captured
 * frame lasts until the next one arrived, divided by the playback speed at
 * that moment (waits on the network play faster), so the video's clock and
 * the wall clock drift apart; captions and the poster are marked on the wall
 * clock and must be moved onto the video's.
 */
export function buildTimeline(
  frames: { at: number }[],
  end: number,
  speedAt: (t: number) => number,
): { durations: number[]; outputTime(t: number): number } {
  const durations: number[] = [];
  const starts: number[] = [];
  let clock = 0;
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? end;
    const d = Math.max(next - f.at, 0.001) / speedAt(f.at);
    starts.push(clock);
    durations.push(d);
    clock += d;
  });
  return {
    durations,
    outputTime(t) {
      let i = -1;
      for (let j = 0; j < frames.length; j++) if (frames[j]!.at <= t) i = j;
      if (i < 0) return 0;
      const next = frames[i + 1]?.at ?? end;
      const share = Math.min(1, (t - frames[i]!.at) / Math.max(next - frames[i]!.at, 0.001));
      return starts[i]! + share * durations[i]!;
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run scripts/lib/timeline.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mark captions and the poster moment in `record()`**

In `scripts/record-demo.ts`, add `import { buildTimeline } from "./lib/timeline.js";` beside the other imports.

Replace the `caption` helper:

```ts
  /** Every caption, on the wall clock: the video's chapters come from these. */
  const marks: { label: string; at: number }[] = [];
  const caption = (step: string, text: string) => {
    marks.push({ label: step, at: Date.now() / 1000 });
    return page.evaluate(([s, t]) => (window as unknown as { __caption(a: string, b: string): void }).__caption(s, t), [step, text]);
  };
```

In the Check step, replace

```ts
  await scrollTo(page.getByRole("heading", { name: "Every payment would go through" }));
  await pause(2200);
```

with

```ts
  await scrollTo(page.getByRole("heading", { name: "Every payment would go through" }));
  await pause(1100);
  // The poster: the payer's side, every payment checked (home polish §3.1).
  marks.push({ label: "poster", at: Date.now() / 1000 });
  await pause(1100);
```

Change the `encode(...)` call at the end of `record()` to pass the marks:

```ts
  encode(`${layout}-${theme}`, shape, capture.frames, begin, end, work, marks);
```

- [ ] **Step 6: Use the timeline in `encode()`**

Replace the whole `encode` function with:

```ts
function encode(
  name: string, { view, scale }: Shape, frames: Frame[], begin: number, end: number, dir: string,
  marks: { label: string; at: number }[],
) {
  const kept = frames.filter((f) => f.at >= begin - 0.05);
  const inWait = (t: number) => fastForward.some((w) => t >= w.from && t < w.to);
  const timeline = buildTimeline(kept, end, (t) => (inWait(t) ? WAIT_SPEED : 1));
  const lines: string[] = [];
  kept.forEach((f, i) => lines.push(`file '${f.file}'`, `duration ${timeline.durations[i]!.toFixed(4)}`));
  // The concat demuxer ignores the last duration unless the file repeats.
  lines.push(`file '${kept.at(-1)!.file}'`);
  const list = join(dir, "frames.txt");
  writeFileSync(list, lines.join("\n"));

  mkdirSync(OUT, { recursive: true });
  const mp4 = join(OUT, `run-${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `fps=30,scale=${view.width * scale}:${view.height * scale}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "stillimage",
    "-movflags", "+faststart", "-an", mp4,
  ]);

  // One chapter per step number: "4 · Paid" is still the Pay chapter.
  const firstOfStep = new Map<string, number>();
  for (const m of marks) {
    const n = /^(\d) ·/.exec(m.label)?.[1];
    if (n && !firstOfStep.has(n)) firstOfStep.set(n, timeline.outputTime(m.at));
  }
  const chapters = [...firstOfStep.values()];
  const posterMark = marks.find((m) => m.label === "poster");
  if (!posterMark) throw new Error(`[${name}] the Check step never marked its poster`);
  const posterAt = timeline.outputTime(posterMark.at);

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", posterAt.toFixed(3), "-i", mp4,
    "-frames:v", "1", "-q:v", "3", join(OUT, `run-${name}.jpg`),
  ]);
  console.log(`[${name}] chapters ${chapters.map((c) => c.toFixed(3)).join(" ")} · poster ${posterAt.toFixed(1)}`);
}
```

Update the script's header comment: in the line "Writes frontend/public/demo/run-<layout>-<theme>.mp4 and .jpg, and prints each run's transaction for …", change "prints each run's transaction" to "prints each run's transaction, chapter starts and poster time".

- [ ] **Step 7: Typecheck the script**

Run:

```bash
pnpm exec tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --lib es2022,dom --typeRoots frontend/node_modules/@types --types node scripts/record-demo.ts scripts/lib/timeline.ts
```

Expected: no output, exit 0. The script is not re-run: that would spend four testnet runs to reproduce files that already exist.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/timeline.ts scripts/lib/timeline.test.ts scripts/record-demo.ts
git commit -m "feat(scripts): the demo recorder prints chapter starts and takes its poster from the Check step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The chapter rail, the feed line and the bridge sentence

**Files:**
- Modify: `frontend/components/ui/DemoVideo.tsx`
- Modify: `frontend/app/styles/pages.css` (the demo block)
- Modify: `docs/superpowers/specs/2026-09-28-home-polish-design.md` §4.1 (one correction, Step 4)

**Interfaces:**
- Consumes: `DEMO_STEPS`, `DEMO_BRIDGE`, `chapterAt`, `DemoClip.chapters` from Task 4.

- [ ] **Step 1: Follow the video**

In `frontend/components/ui/DemoVideo.tsx`:

1. Replace the demo-run import with:

```tsx
import {
  DEMO_BRIDGE, DEMO_RUN, DEMO_STEPS, WIDE_QUERY, chapterAt, demoClip, type DemoLayout,
} from "@/lib/demo-run";
```

2. After `const descId = useId();` add:

```tsx
  const feed = useRef<HTMLSpanElement>(null);
  // -1 until the video has played: the poster is a frame from Check, so
  // highlighting Upload over it would say something untrue.
  const [chapter, setChapter] = useState(-1);
  const shown = useRef(-1);

  // The rail and the feed line follow the video itself: one frame loop while
  // it plays, one read when it pauses or seeks. The feed line is written
  // straight to the DOM, so a frame costs no React render; the chapter is
  // state, and changes only when the chapter does.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    shown.current = -1;
    setChapter(-1);
    let raf = 0;
    const draw = () => {
      const p = v.duration > 0 ? Math.min(1, v.currentTime / v.duration) : 0;
      if (feed.current) feed.current.style.transform = `translateX(${(p - 1) * 100}%)`;
      if (v.paused && v.currentTime === 0) return;
      const c = chapterAt(clip.chapters, v.currentTime);
      if (c !== shown.current) { shown.current = c; setChapter(c); }
    };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); draw(); };
    v.addEventListener("play", start);
    v.addEventListener("pause", stop);
    v.addEventListener("ended", stop);
    v.addEventListener("seeked", draw);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", start);
      v.removeEventListener("pause", stop);
      v.removeEventListener("ended", stop);
      v.removeEventListener("seeked", draw);
    };
  }, [clip]);

  /** A chapter pressed is the viewer choosing Play, as the Play button is. The
   *  0.05s keeps the seek off the previous chapter's last frame. */
  const seek = (i: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = clip.chapters[i]! + 0.05;
    v.muted = true;
    void v.play().catch(() => setPlaying(false));
    setChosen("play");
  };
```

3. In the JSX, between the `<video … />` and `<figcaption …>`, add:

```tsx
      <div className="demo-feed" aria-hidden="true"><span ref={feed} /></div>
      <ol className={`demo-chapters is-${layout}`} aria-label="Chapters">
        {DEMO_STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" aria-current={i === chapter ? "step" : undefined} onClick={() => seek(i)}>
              <span className="demo-chapter-n">{i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>
```

4. Replace the description span's text, keeping its links:

```tsx
        <span id={descId} className="because">
          Three invoices uploaded, checked against the chain, paid in one transaction, and
          the first recipient&apos;s receipt verified, in this app on {DEMO_RUN.recorded}.{" "}
          {DEMO_BRIDGE}{" "}
          <a href={clip.receipt}>Open that receipt</a>
          {" · "}
          <a href={`${DEMO_RUN.explorer}/tx/${clip.txHash}`} target="_blank" rel="noreferrer">
            the transaction ↗
          </a>
        </span>
```

5. Extend the component's doc comment with one sentence: "Under it, a feed line and five chapters follow the video; pressing a chapter plays from there."

- [ ] **Step 2: Style the rail and the feed line**

In `frontend/app/styles/pages.css`, after the `.demo-toggle:hover` rule, add:

```css
/* The feed line: the tape feeding out as the video plays (home polish §4.1).
   A full-width dashed line slid in from the left, so its dashes keep their
   length — scaling it would stretch them. */
.demo-feed { height: 2px; margin-top: 10px; overflow: hidden; }
.demo-feed > span {
  display: block; height: 0; border-top: 1.5px dashed var(--ink);
  transform: translateX(-100%); will-change: transform;
}
@media (prefers-reduced-motion: reduce) { .demo-feed { display: none; } }

.demo-chapters { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; }
.demo-chapters button {
  display: inline-flex; align-items: baseline; gap: 6px; min-height: 28px; padding: 4px 8px;
  background: none; border: 0; color: var(--ink-soft); cursor: pointer;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
}
.demo-chapters button:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.demo-chapters button[aria-current="step"] { background: var(--highlight); color: var(--on-highlight); }
.demo-chapter-n { font-weight: 700; }
/* With the phone recording: five columns, number over label, at the bottom
   tabs' size. */
.demo-chapters.is-phone { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; }
.demo-chapters.is-phone button {
  width: 100%; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0;
  font-size: 10.5px; letter-spacing: 0.04em;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @ledgerline/web typecheck && pnpm --filter @ledgerline/web test` → exit 0, all pass.

Build, serve, open `/` at 1440×900 in Playwright, scroll the demo into view, wait 6s, and read `document.querySelector('.demo-chapters [aria-current="step"]').textContent` → contains `Review` (the video is past 4.2s). Click the `Pay` chapter, wait 500ms: `currentTime` between 16.40 and 17.0 and `paused === false`. Read `.demo-feed > span` `style.transform` twice 500ms apart while playing: the translateX percentage rises. Stop the server.

- [ ] **Step 4: Correct the spec's feed-line wording**

In `docs/superpowers/specs/2026-09-28-home-polish-design.md` §4.1, replace

```markdown
- Drawn with `transform: scaleX(p)`, `transform-origin: left`: no layout, no
  shift.
```

with

```markdown
- A full-width dashed line inside a 2px track with `overflow: hidden`, slid in
  with `transform: translateX((p − 1) × 100%)`: no layout, no shift, and the
  dashes keep their length (`scaleX` would stretch them).
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/DemoVideo.tsx frontend/app/styles/pages.css docs/superpowers/specs/2026-09-28-home-polish-design.md
git commit -m "feat(web): the demo's chapters and feed line follow the video; a chapter pressed plays from there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The example receipt prints in

**Files:**
- Modify: `frontend/app/(public)/page.tsx` (the hero's example `<Tape>`)
- Modify: `frontend/app/styles/pages.css` (after `.example-caption`)

The example tape's children, in order: `.tape-head` (1), Invoice `.leader` (2), To `.leader` (3), `.amount` (4), `.rule-dashed` (5), "Five checks" `.leader` (6), `.stamp` (7).

- [ ] **Step 1: Name the tape**

In `frontend/app/(public)/page.tsx`, give the hero's example tape a class:

```tsx
        <Tape className="tape--example" head={<><strong>Payment advice</strong><span className="hl">Example</span></>}>
```

- [ ] **Step 2: Print it in**

In `frontend/app/styles/pages.css`, after `.example-caption { … }`, add:

```css
/* The example prints in once, on load (home polish §4.2): the checks'
   print-in rhythm from /r, 70ms apart, then the stamp lands. Printing, not
   checking — the tape says Example. `backwards`: a line is hidden only while
   it waits its turn, so a browser that skips this shows the tape whole. */
@media (prefers-reduced-motion: no-preference) {
  .tape--example > :nth-child(n + 2):not(.stamp) { animation: print-in 260ms ease-out backwards; }
  .tape--example > :nth-child(3) { animation-delay: 70ms; }
  .tape--example > :nth-child(4) { animation-delay: 140ms; }
  .tape--example > :nth-child(5) { animation-delay: 210ms; }
  .tape--example > :nth-child(6) { animation-delay: 280ms; }
  .tape--example > .stamp { animation: stamp-in 120ms ease-out 540ms backwards; }
}
@keyframes stamp-in { from { opacity: 0; transform: scale(1.06); } }
```

(`print-in` is already defined in `tape.css`. The last line ends at 540ms, the stamp at 660ms: under the spec's 700ms.)

- [ ] **Step 3: Verify**

Typecheck → exit 0. Build, serve. In a fresh Playwright context without reduced motion, right after `goto("/")` read

```js
[...document.querySelectorAll(".tape--example > *")].map((el) => el.getAnimations().map((a) => a.animationName).join(","))
```

Expected: `["", "print-in", "print-in", "print-in", "print-in", "print-in", "stamp-in"]` (or empty entries for any that already finished). In a context with `reducedMotion: "reduce"`: every entry `""`. After 1s, every child's computed `opacity` is `"1"`. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(public)/page.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): the hero's example receipt prints in once, then its stamp lands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pointers in the parent spec, and the whole page in a browser

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-tape-design-system-design.md` (§7.1, §7.4, §8)
- Create then delete: `.verify-home.mjs` (repo root; not committed)

- [ ] **Step 1: Point the parent spec at the amendment**

In `docs/superpowers/specs/2026-09-24-tape-design-system-design.md`, add as the first line under each heading:

- under `### 7.1 Home` : `> Amended by `2026-09-28-home-polish-design.md` §3: the demo video, h2 section heads, the comparison as a list on a phone.`
- under `### 7.4 Site footer` : `> Amended by `2026-09-28-home-polish-design.md` §3.5: a full-width band after `<main>`, not a tape.`
- under `## 8. Motion` : `> Amended by `2026-09-28-home-polish-design.md` §4: chapters that follow the demo video, the example receipt printing in, and no count-ups.`

- [ ] **Step 2: Write the browser check**

Build and serve, then create `.verify-home.mjs` at the repo root:

```js
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const AXE = ".playwright-mcp/axe.min.js";
const RECEIPT = "/r/0x56e067011c4208b0d80bb9b2fd1ad0cd0af5a8aea39bf342a15e24bf7c50a7f7?i=INV-US-001&s=0xd59190857dfbdf14a837ca8b1b79918fbb7cdbfdda605da3a2ab29ee0e3d7e5d&p=u02XKki1yNt2gWg7DjZuaAIcf8mb_N0M2Y5D160bTPqMYatQVc8vmtsbNT877iINFz0J3NLVlyz0E4vjFlFQcQ&n=testnet";
const WIDE_LIGHT = [0, 4.2, 9.833, 16.367, 23.867];
const STEPS = ["Upload", "Review", "Check", "Pay", "Receipt"];
const fails = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) fails.push(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

async function open(path, { width = 1440, height = 900, theme = "light", reduced = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, colorScheme: theme, reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addCookies([{ name: "theme", value: theme, domain: "localhost", path: "/" }]);
  await context.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: "layout-shift", buffered: true });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + path);
  await sleep(1200);
  return { context, page, errors };
}
const current = (page) => page.evaluate(() => document.querySelector('.demo-chapters [aria-current="step"]')?.textContent.replace(/^\d\s*/, "").trim() ?? null);
const toDemo = async (page) => { await page.locator(".demo").evaluate((el) => el.scrollIntoView({ block: "center" })); await sleep(1500); };
const video = (page) => page.evaluate(() => { const v = document.querySelector(".demo-video"); return { t: v.currentTime, paused: v.paused, src: v.getAttribute("src") }; });

// Every width and theme: axe, errors, scroll, comparison, footer.
for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 640]]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width} ${theme}`;
    const { context, page, errors } = await open("/", { width, height, theme });
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => v.id));
    check(violations.length === 0, `${tag}: axe clean ${JSON.stringify(violations)}`);
    const m = await page.evaluate(() => {
      const d = document.documentElement, f = document.querySelector(".site-footer");
      const shown = (s) => getComputedStyle(document.querySelector(s)).display !== "none";
      const btns = [...document.querySelectorAll(".demo-chapters button")].map((b) => b.getBoundingClientRect());
      return {
        hscroll: d.scrollWidth > d.clientWidth, table: shown(".versus-table"), list: shown(".versus-list"),
        footerW: Math.round(f.getBoundingClientRect().width), viewW: d.clientWidth,
        footerLeft: Math.round(f.querySelector(".tape-head").getBoundingClientRect().left),
        logoLeft: Math.round(document.querySelector(".public-bar .brand").getBoundingClientRect().left),
        smallest: Math.min(...btns.map((r) => Math.min(r.width, r.height))),
      };
    });
    check(!m.hscroll, `${tag}: no horizontal scroll`);
    check(width < 640 ? (m.list && !m.table) : (m.table && !m.list), `${tag}: comparison is ${width < 640 ? "a list" : "a table"}`);
    check(m.footerW === m.viewW, `${tag}: footer spans the viewport (${m.footerW} of ${m.viewW})`);
    check(m.footerLeft === m.logoLeft, `${tag}: footer content lines up with the logo (${m.footerLeft} / ${m.logoLeft})`);
    check(m.smallest >= 24, `${tag}: every chapter button ≥ 24px (smallest ${m.smallest})`);
    check((await page.getByRole("contentinfo").count()) === 1, `${tag}: one contentinfo landmark`);
    check(errors.length === 0, `${tag}: no console errors ${JSON.stringify(errors)}`);
    await context.close();
  }
}

// Footer on /why, not on /r; network follows ?n= like the badge.
{
  const why = await open("/why?n=testnet");
  check((await why.page.getByRole("contentinfo").count()) === 1, "/why: one contentinfo landmark");
  const text = await why.page.locator(".site-footer .tape-head").textContent();
  check(text.includes("Arc testnet · chain 5042002"), `footer network: /why?n=testnet names testnet (${text})`);
  await why.context.close();
  const r = await open(RECEIPT);
  check((await r.page.getByRole("contentinfo").count()) === 0, "/r: no site footer");
  await r.context.close();
}

// Chapters follow playback across every boundary.
{
  const { context, page } = await open("/");
  await toDemo(page);
  check((await video(page)).paused === false, "chapters: the video plays once in view");
  for (let i = 1; i < WIDE_LIGHT.length; i++) {
    await page.evaluate((t) => { document.querySelector(".demo-video").currentTime = t; }, WIDE_LIGHT[i] - 0.4);
    await sleep(150);
    check((await current(page)) === STEPS[i - 1], `chapters: just before ${STEPS[i]} shows ${STEPS[i - 1]}`);
    await sleep(700);
    check((await current(page)) === STEPS[i], `chapters: just after the start shows ${STEPS[i]}`);
  }
  await page.getByRole("button", { name: /Pay$/ }).click();
  await sleep(500);
  const v = await video(page);
  check(v.t >= 16.367 && v.t < 17.2 && !v.paused, `chapters: pressing Pay plays from 16.4s (at ${v.t.toFixed(2)})`);

  // Feed line grows while playing, holds while paused, and the frame loop stops.
  const feed = () => page.evaluate(() => parseFloat(/translateX\((-?[\d.]+)%\)/.exec(document.querySelector(".demo-feed > span").style.transform)?.[1] ?? "-100"));
  const a = await feed(); await sleep(600); const b = await feed();
  check(b > a, `feed line grows while playing (${a.toFixed(1)} → ${b.toFixed(1)})`);
  await page.getByRole("button", { name: /Pause the recording/ }).click();
  await page.evaluate(() => { window.__rafs = 0; const raf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => { window.__rafs++; return raf(cb); }; });
  const c = await feed(); await sleep(600); const d = await feed();
  check(c === d, "feed line holds while paused");
  check((await page.evaluate(() => window.__rafs)) === 0, "no frame callback is requested after pause");

  // Layout shift over load, play, seeks and pause.
  check((await page.evaluate(() => window.__cls)) === 0, `layout shift is 0 (${await page.evaluate(() => window.__cls)})`);
  await context.close();
}

// Keyboard chapters.
{
  const { context, page } = await open("/");
  await toDemo(page);
  const btn = page.getByRole("button", { name: /Check$/ });
  await btn.focus();
  await page.keyboard.press("Enter");
  await sleep(500);
  const v = await video(page);
  check(v.t >= 9.833 && v.t < 10.8, `keyboard chapters: Enter on Check seeks there (${v.t.toFixed(2)})`);
  check(await btn.evaluate((el) => el === document.activeElement), "keyboard chapters: focus stays on the pressed chapter");
  await context.close();
}

// Reduced motion: no feed line, no print-in, and an early chapter press still lands.
{
  const { context, page } = await open("/", { reduced: true });
  check(await page.evaluate(() => getComputedStyle(document.querySelector(".demo-feed")).display === "none"), "reduced motion: no feed line");
  check(await page.evaluate(() => [...document.querySelectorAll(".tape--example > *")].every((el) => el.getAnimations().length === 0)), "reduced motion: the example does not print in");
  await toDemo(page);
  check((await video(page)).paused, "reduced motion: the video waits for Play");
  await page.getByRole("button", { name: /Pay$/ }).click();
  await sleep(1500);
  const v = await video(page);
  check(v.t >= 16.367 && !v.paused, `early chapter press: lands on Pay before anything loaded (${v.t.toFixed(2)})`);
  check((await current(page)) === "Pay", "early chapter press: Pay is highlighted");
  await context.close();
}

// Print-in runs on load, then leaves the tape whole.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const names = await page.evaluate(() => [...document.querySelectorAll(".tape--example > *")].map((el) => el.getAnimations().map((a) => a.animationName).join(",")));
  check(names.filter((n) => n.includes("print-in")).length >= 4 && names.at(-1).includes("stamp-in"), `print-in: runs on load ${JSON.stringify(names)}`);
  await sleep(1000);
  check(await page.evaluate(() => [...document.querySelectorAll(".tape--example > *")].every((el) => getComputedStyle(el).opacity === "1")), "print-in: the tape is whole after it");
  await context.close();
}

// Clip switch mid-play: the rail follows the new clip.
{
  const { context, page } = await open("/");
  await toDemo(page);
  await page.evaluate(() => { document.querySelector(".demo-video").currentTime = 12; });
  await sleep(800);
  check((await current(page)) === "Check", "clip switch: wide clip at 12s shows Check");
  await page.setViewportSize({ width: 800, height: 1000 });
  await toDemo(page);
  const v = await video(page);
  const shown = await current(page);
  check(v.src.includes("phone") && (shown === null || shown === "Upload" || shown === "Review"), `clip switch: the phone clip's own chapter (${shown} at ${v.t.toFixed(2)})`);
  await context.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `node .verify-home.mjs`
Expected: every line `✓`, last line `all passed`, exit 0. Any `✗` is a defect: find its cause (superpowers:systematic-debugging) and fix it in the task that owns the code, with its own commit, then run this again.

- [ ] **Step 4: Look at it**

Take full-page screenshots of `/` at 1440 and 390 in both themes (reduced motion, so nothing is mid-animation) and compare with the spec: the poster shows Check, the footer is a band on `deskDeep`, the chapter rail sits under the feed line, and nothing else moved.

- [ ] **Step 5: Clean up**

```bash
rm .verify-home.mjs
ls .playwright-mcp   # only axe.min.js
```

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-tape-design-system-design.md
git commit -m "docs: the tape spec points at the home polish amendments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
