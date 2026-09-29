# Motion polish — pages that arrive, buttons that answer, counts that count

The app moves only where the machine is working: the feed line, the receipt's
print-in, the key press, and the home page's coins. This spec adds the motion
`/ui-ux-enhance` asks for — pages that arrive, blocks that enter in reading
order, buttons that lift under the pointer, counts that count up — within the
tape's rules, and closes one gap an audit found.

**Parent specs:** `2026-09-24-tape-design-system-design.md` (§8 Motion, §9
Accessibility) and `2026-09-28-home-polish-design.md` (§4 Motion). This spec
**reverses** the parts of both that forbid page transitions, hover lifts and
count-ups, as the product owner chose on 2026-09-29; everything else in them
stands. Nothing here changes core, the payout sequence, any recorded video, or
any invariant in `CLAUDE.md`.

## 1. What the product owner asked for, and what is assumed

Said (2026-09-29):

- Apply `/ui-ux-enhance` in full — page transitions, staggered entrance, hover
  lifts, count-ups — and audit real UX gaps within the tape's rules.
- No command palette.
- Count-ups on **counts only**: a token amount is never rolled.
- Hover lift on **what can be clicked** only.
- Page-in and stagger on **the app and home, not the receipt**.
- Built with **CSS and one small hook**, not framer-motion.

Assumed, stated so it can be corrected:

- The purpose is a more finished feel for the Arc judges before 2026-10-14.
- The rest of the tape stands: radius 0, one focus ring in ink, mono for what
  the machine prints, shadows only on popups — and now on a lifted button.
- The walkthrough and home demo videos recorded before this change stay as
  they are; they show the app without this motion.

## 2. Motion (replaces tape §8's closing rule and home-polish §4's added rule)

Tape §8's "Nothing else: no hover lifts, no page transitions, no scroll
reveals" becomes the list below. Home-polish §4's "no count-ups. A measured
figure is printed, not rolled" becomes **"no amount is rolled"**: a token
amount, a balance, a fee, a block number and anything on a receipt is printed
as it is. Everything else §8 and §4 list — print-in, the feed line, the key
press, the coins, the chapters — is unchanged.

### 2.1 Page-in

When a page mounts, its content fades in (opacity 0 → 1) while rising 12px,
over **350 ms, ease-out**.

- Pages: Dashboard, Runs, Run (`/run/…`), New, Home, Compare (`/why`).
- **Not `/r`.** The receipt keeps only its print-in: the six checks appearing
  in turn means they ran in turn, and a fade over the whole page would put a
  moment before the verdict where nothing is legible.
- New's steps (Upload, Review, Check, Pay, Receipts) are one route; each step
  change plays the same page-in on the step's content, not on the summary
  beside it.
- The animation is on the element's CSS from the server's HTML, with
  `animation-fill-mode: backwards`: it runs from the first paint, before
  hydration, and a browser that skips it shows the page complete. **A page is
  never blank while JavaScript loads.**
- Only `opacity` and `transform` animate: nothing reflows, and nothing below
  the page moves.

### 2.2 Stagger

The page's top-level blocks enter one after another in reading order: the
n-th top-level column of the page starts its page-in (n − 1) × **80 ms** after
the first, **capped at 5 steps (400 ms)**, so a long page is fully in within
0.75 s. A column nested inside another column enters with its parent. The
stagger follows the same pages as §2.1, and so is absent on `/r`.

### 2.3 Hover lift

Primary and default buttons — antd's solid and outlined buttons and our own
`.button-primary` — rise **1px** under the pointer and gain a thin paper
shadow, over **150 ms, ease-out**. On press they drop to 1px *below* rest with
no shadow (§8's key press, unchanged). A disabled or loading button does not
lift.

- Text and link buttons, links, table rows, tapes and stat tiles do not lift:
  a tape or a row is not clickable as a whole, and a lift would say it is.
- The shadow is `0 3px 8px -4px rgb(0 0 0 / 0.35)` in both themes, derived
  from the popup shadow; it is the only non-popup shadow in the product.
- Hover lift is CSS only: no script runs on hover.
- It needs a hover-capable pointer: `@media (hover: hover)`. A touch screen
  shows no stuck lift after a tap.

### 2.4 Count-up

A standalone count counts up from 0 to its value over **800 ms, ease-out
cubic**, in whole numbers, when it first appears, and from its old value to
its new one when it changes. It lands exactly on the value and never passes
it.

Counts that count:

| Where | Count |
|---|---|
| New, Receipts step (Result) | the "N paid" figure |
| Run (`/run/…`) | the Payments stat's figure |

That is all of them today. Dashboard's figures are amounts, one per token, and
are printed. A block number is an identifier, not a count.

- The rolling figure is `aria-hidden`; a visually hidden copy carries the real
  value, so a screen reader reads the value once and never a number that is
  not true.
- A figure already in the server's HTML is rendered at its value and does not
  roll on hydration; a figure rolls only when it appears or changes on the
  client. Both counts above appear only after the page has read the chain, so
  both roll.

### 2.5 Reduced motion

Under `prefers-reduced-motion: reduce` every motion above is static: pages and
blocks are simply there, buttons do not lift (they keep their colour change),
and counts show their value. This is the rule §8 already sets for every
motion; each new animation is written inside
`@media (prefers-reduced-motion: no-preference)`, and the count-up hook reads
the same media query.

## 3. The audit, and the one gap it found

Read on 2026-09-29, over every `<Button>` with an `onClick` and every
interactive element:

- The money flow already shows what it is doing: Check has phases and a
  skeleton, the Review step's "Check balances" button shows `loading`, Pay
  replaces its button with its stages, and every retry reverts to a skeleton.
- No `div`, `span`, `li`, `tr` or `td` takes a click; the two
  `outline: none` rules are on a programmatic focus target (`.fix-list`,
  `tabIndex={-1}`) and on an input inside a cell that draws its own ring.
- Skeletons are already `active` inside a feeding tape; the one toast
  (`WalletButton`) is antd's `message`, which animates itself.

**The gap:** the three in-page "Connect a wallet" buttons — Dashboard, Runs,
and the Review step's "Connect a wallet to continue" — ignore
`WalletProvider`'s `connecting`. While a wallet's prompt is open they stay
clickable and say nothing. They take `loading={connecting}`, as the top bar's
`WalletButton` already does.

## 4. What else has to know

- **The recorders.** `scripts/lib/take-recorder.ts` logs a focus's box after
  scrolling stops; a block still rising would be logged 12px low. Its
  `settle()` also waits until `document.getAnimations()` holds no running
  page-in, stagger or count-up. `scripts/record-demo.ts` gets the same wait
  wherever it marks a moment.
- **axe.** axe measures contrast with opacity, so a check run mid-fade reports
  text that is fine at rest. The axe pass runs after every animation has
  finished, or with reduced motion — and motion is then checked separately.

## 5. Constraints

- No new dependency; `package.json` and the lockfile do not change.
- CSS keyframes and one hook (`useCountUp`); the hook's arithmetic is a pure
  function with its own tests.
- Durations: 150 ms (hover), 350 ms (page-in), 80 ms steps capped at 400 ms
  (stagger), 800 ms (count-up). Nothing longer.
- Radius stays 0 everywhere; the focus ring stays `2px solid var(--focus)`,
  offset 2.
- Both themes; no colour is added.

## 6. Verification

- **Unit:** the count-up's values are whole, never decrease on the way up,
  never pass the target, start at the old value and end exactly on the new
  one; reduced motion returns the target at once.
- **Source:** every new `@keyframes` and every hover lift is inside
  `@media (prefers-reduced-motion: no-preference)`; the lift is inside
  `@media (hover: hover)`; no `border-radius` other than 0 appears; `/r`'s
  markup carries no page-in class.
- **In a real browser (Playwright, `next start`), both themes:**
  - page-in and stagger run on the six pages in §2.1 (`getAnimations()` on
    first paint) and not on `/r`;
  - with JavaScript blocked, every page still renders complete;
  - with reduced motion, no animation runs and counts show their value;
  - hovering a primary button moves it up 1px (computed `transform`); a
    disabled one does not move;
  - a count on `/run` lands on the value the table shows;
  - axe: no `serious` or `critical` on the seven routes, after animations end.
- **Suite:** `pnpm test` and `pnpm build` green.

## 7. Out of scope

- A command palette; framer-motion; a custom toast system; changing the
  skeletons.
- Re-recording the walkthrough or the home demo videos.
- Motion on `/r` beyond its print-in.
- Rolling any amount, balance, fee or block number.

## 8. Unknowns

| Question | How it is settled |
|---|---|
| Does a route-level `template.tsx` in Next 16.3.5 remount on a search-param change (the `?n=` network), replaying page-in? `[unverified]` | Measured during implementation; either answer is acceptable, and the plan records which |
| Does the home page's coin roll read well while the page is still rising? | Looked at in the browser; if the two fight, the hero skips page-in and the rest of the page staggers as specified |
