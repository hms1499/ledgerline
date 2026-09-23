# Redesign, part 3 — Page migration

Move the six pages built before the redesign onto the 12-column grid, in the
card language `/dashboard` already uses, then remove the old CSS aliases.

**Parent specs:**
- `2026-09-23-redesign-shell-design.md` (part 1: §2 defines this part, §6.2
  gives the column plan, §5.4 promises the aliases go at the end of part 3)
- `2026-09-23-dashboard-design.md` (part 2: the stat tile, and the rule that
  a decimal is never guessed)
- `2026-09-21-ledgerline-design.md` (product, chain constraints)

Nothing here changes core, the payout sequence, the wallet session, or any
URL. This is layout, shared presentation components, and one display defect
(§3.4) that the new tiles would otherwise carry forward.

---

## 1. Decisions already made

| Question | Decision |
|---|---|
| Visual language | **Cards everywhere.** Every block inside a `Col` sits on a `surface` panel, as on `/dashboard`. The ledger vocabulary (verdict headline, check ladder, amount line with its invoice reference) stays, inside the panels |
| Rejected: flat pages, grid only | Would leave `/dashboard` the only page that looks like the product the shell promises |
| Rejected: public pages flat, app pages carded | Two visual systems in one product; the receipt reads as a document either way because of its content, not its lack of a card |
| `/new` side column | A **sticky run summary**, shown from Preview to Send (§4.2). On Upload the column holds the CSV format help. Result is full width |
| `/run/[tx]` stats | Four tiles: **Payments · Completeness · Review · Recorded** (§4.4) |
| Rejected: one tile per token on `/run/[tx]` | A USDC-only run would show two meaningless zeros, and completeness — the page's main answer — would fall out of the tile row |
| Card component | Our own `Panel`, not antd `Card` (§3.1) |

## 2. What exists today (measured 2026-09-23)

- All six pages render inside `.sheet` (44rem) or `.sheet--wide` (68rem).
  Only `/dashboard` uses `Grid`/`Col`.
- Old alias names are used about 62 times in `app/globals.css` and 11 times
  inline in `Reconciliation.tsx` and `Why.tsx`.
- `/`, `/run/[tx]` and `/r/[tx]` each draw a `.masthead`. On `/` it repeats
  the logo and network badge `PublicShell` already shows; on `/run/[tx]` it
  repeats the top bar's page title.
- `/` links its two calls to action to `/new` and `/runs`. `/dashboard`,
  the payer's home since part 2, is not linked from it.
- `Reconciliation.tsx` has `Headline` and `Receipt.tsx` has `Verdict`: the
  same component written twice.
- Five places render an amount with `decimals ?? 6` (§3.4).

## 3. Shared pieces

### 3.1 `components/ui/Panel.tsx`

```tsx
<Panel title="Can this wallet pay it?">…</Panel>   // <section> + <h2>
<Panel>…</Panel>                                    // <section>, no heading
```

- `surface` background, `border` edge, 8px radius, 20px padding (16px at
  `sm`). Styles live in `globals.css` under `.panel`, beside `.stat-tile`.
- `title` renders an `<h2>`. antd `Card` renders its title in a `div`, which
  drops the section from a screen reader's heading outline. That is the
  reason for owning this component.
- `aria-labelledby` ties the section to its heading when there is one.

### 3.2 `components/ui/StatTile.tsx`

Moved out of `Dashboard.tsx` unchanged in look: label, value, secondary line.
The dashboard imports it from here; `/run/[tx]` is its second user. The value
accepts a node so a tile can colour its value by tone.

### 3.3 `components/ui/Verdict.tsx`

One component for the verdict headline, replacing `Headline`
(`Reconciliation.tsx`) and `Verdict` (`Receipt.tsx`). Props: `tone`
(`ok` | `error` | `critical` | `degraded` | none), `title`, `body`. It keeps
the `.verdict` classes, so its look does not change.

### 3.4 Amounts never guess a decimal

Today `formatAmount(value, meta?.decimals ?? 6)` appears in:

| File | Line (today) |
|---|---|
| `app/(app)/new/StepPreview.tsx` | 90, 112 |
| `app/(app)/new/Result.tsx` | 78, 104 |
| `app/(app)/run/[txHash]/Reconciliation.tsx` | the summary line and the table footer |

On `/run/[tx]`, token metadata is read from the chain and can fail. A cirBTC
(8 decimals) amount then renders 100× too large. That breaks the rule in the
dashboard spec (§5: "a decimal is never guessed"). In the create flow,
`resolveRows` needs decimals to parse amounts at all, so the fallback there
is probably unreachable. It is still a guess written into the code, and
`Result.tsx:78` feeds the exported receipt list.

**Fix:** move `amountText` and `TokenMeta` from `lib/dashboard-view.ts` to
`lib/token-meta.ts`, and render every amount through it. Without decimals,
the output is the raw integer and a short token address, as on the
dashboard. `dashboard-view.ts` re-imports it. No `?? 6` remains anywhere in
`apps/web` (checked by the guard in §5.3).

### 3.5 `Grid dense`

`/new` puts the summary **before** the step content in the DOM (§4.2) but
shows it on the right at `lg`. With explicit column starts, the default
sparse placement would push the content onto a second row, so `Grid` gets an
opt-in `dense` prop that adds `grid-auto-flow: row dense`. Class assembly
moves into a pure `gridClass({ dense, className })` in `lib/grid.ts`, so it
is unit-tested like `colVars`. No other grid uses `dense`.

## 4. The pages

Rule for `md` (640–1023px): every column becomes 12 wide unless the table
below says otherwise. `sm` is always 12, from part 1.

### 4.1 `/` — Public

| Block | `lg` | Content |
|---|---|---|
| Hero | 7 | h1, the existing paragraph, primary **Create a payout run** → `/new`, secondary link **Open your dashboard** → `/dashboard` |
| Ledger-line card | 5 | The existing sample line (0.10 USDC · INV-US-001), in a Panel labelled **Example**, so it is never read as someone's real payment |
| Three steps | 4 / 4 / 4 | One Panel each, keeping the numbered step and copy |
| Testnet note | 12 | Only on testnet, as now |
| Footer | 12 | `/why` link and the `npx arc-reconcile` line |

The `.masthead` is removed; `PublicShell` already carries the name and network.
The `/runs` link moves off the landing page: runs are reachable from the app
shell, and the dashboard links to them.

### 4.2 `/new` — App

| Block | `lg` | `md` |
|---|---|---|
| Step bar (or the `sm` one-liner) | 12 | 12 |
| Run summary (`aside`, sticky) | `start={9} span={4}` | 12, above the content |
| Step content | `span={8}` | 12 |

`<Grid dense>`; the summary comes **first in the DOM**. At `md` and `sm` the
payer therefore reads what they are about to sign before they reach Send,
and a screen reader hears it first too.

**Run summary** (`RunSummary.tsx`, fed by the pure `runSummaryView`):

- Run name, payment count, per-token totals (one line per token, never
  pooled, through `amountText`), network, paying wallet (short, nowrap).
- After Preflight: the `runId`, as mono text.
- **Source of truth by step:** Preview and Preflight read the draft. Send
  reads `prepared.manifest`, which is exactly what is signed. If the two
  ever disagreed, the card would show the signed one.
- These are *requested* amounts, labelled "To pay". They are what the payer
  asked for, not a reconciliation claim; invariant 5 applies to what was
  paid, which only `/run/[tx]` and receipts report.

On Upload there is no draft; the side column holds the CSV format help and
sample that `StepUpload` already shows, moved into a Panel. On Result the
grid is a single 12-column block.

`StepPreview`'s own `line--summary` block moves into the summary; it is not
shown twice. Nothing about step state, `held`, `sendStaysOnScreen` or the
wallet session changes: `CreateRun` gains a layout around its steps and
nothing else.

### 4.3 `/runs` — App

- Not connected / nothing recorded: one Panel, 12, holding the current
  `Verdict` and its action.
- Recorded: the "A shortcut, not a record" Alert, 12; the table in a Panel,
  12, with `scroll={{ x: "max-content" }}` kept.
- The footer's "Create a payout run" link is removed: the sidebar and bottom
  tabs carry New payout. The empty state keeps its own link.

### 4.4 `/run/[tx]` — App

The `.masthead` is removed; the top bar already says "Payout run".

**Ready:**

| Block | `lg` | `md` |
|---|---|---|
| 4 stat tiles | 3 / 3 / 3 / 3 | 6 / 6 |
| Completeness note | 12 | 12 |
| Run-file Alerts (load prompt, match result) | 12 | 12 |
| Reconciliation table, in a Panel | 12 | 12 |
| Link recovery, in a Panel | 8 | 12 |
| Endpoint footer | 12 | 12 |

Tiles, built by the pure `runStatsView(result, completeness, hasManifest,
blockNumber, tokens)`:

| Tile | Value | Secondary line |
|---|---|---|
| Payments | payment count | per-token totals, one per line, via `amountText` |
| Completeness | Complete / N missing / N not on the list / Unknown, tone `success` / `danger` / `danger` / `warning` | — |
| Review | All matched / N to review / Read from chain (no run file) | per-status counts, as the table footer shows now |
| Recorded | block number | "View on explorer" link to the transaction |

Colour is never the only signal: every value is a word or a number.
`completeness.note` sits under the tiles as soft text, replacing the large
verdict headline, which the Completeness tile now states.

**Failure phases** (`tx_not_found`, `run_reverted`, `rpc_unreachable`): one
Panel, 12, holding the `Verdict` and the phase's existing action. Loading
shows `Skeleton`s in the tile row and the table Panel.

### 4.5 `/r/[tx]` — Public

- One receipt Panel: `start={4} span={6}` at `lg` (columns 4–9, per part 1),
  `start={2} span={10}` at `md`, 12 at `sm`.
- The masthead ("Payment advice · Arc testnet at block N") becomes the
  panel's header row. The public shell has no page title, and for the
  recipient this line names the document they were sent.
- Inside: the amount line, `Verdict`, the check ladder and the details
  Collapse, all unchanged in content. The endpoint footer sits under the
  Panel in the same columns.

### 4.6 `/why` — Public

The comparison, 12; the two transaction cards (`.compare` / `.card` today),
6 / 6 at `lg` and 12 at `md`, as Panels.

## 5. CSS clean-up

### 5.1 Aliases go

Every use of `--ground`, `--ink`, `--ink-soft`, `--rule`, `--ruleStrong`,
`--tick`, `--flag`, `--pending` is replaced by its token (`--bg`, `--text`,
`--text-soft`, `--border` or `--control` as §5.1 of part 1 requires,
`--success`, `--danger`, `--warning`). Then the alias block is deleted.

`--raised` is **not** an alias: it is a real token (`raised`), and the
theme selectors already override the alias value. Old uses that meant "card
background" (`.card`) move to `--surface` through `Panel`; `--raised` keeps
its token meaning (active nav, hover). `--measure` is a line-length
setting, not a colour, and stays.

### 5.2 Dead classes go

After the pages move, classes with no remaining user are removed:
`.sheet`, `.sheet--wide`, `.masthead`, `.compare`, `.card`, `.card-title`,
and any other class a `grep` over `app/` and `components/` no longer finds.
The plan lists them from a grep at that point, not from this spec.

### 5.3 A guard so they stay gone

A vitest test (`test/no-legacy-css.test.ts`) reads `app/globals.css` and
every `.ts`/`.tsx` under `app/`, `components/` and `lib/`, and fails on:

- any old alias name from §5.1;
- the pattern `decimals ?? ` followed by a number (§3.4).

## 6. Error handling

Nothing new can fail. The pages keep their current states and copy; only
their placement changes. The one behaviour change is §3.4: an amount whose
token metadata could not be read now shows the raw integer and a short
address instead of a wrong decimal.

## 7. Testing and definition of done

### 7.1 Unit (vitest, part of `pnpm test`)

- `gridClass`: `dense` adds the class; `className` is kept.
- `amountText` (moved): with decimals, formats; without, raw integer and short
  address; a cirBTC value with 8 decimals is never formatted as 6.
- `runSummaryView`: per-token totals in token order and never pooled; at Send
  it uses `prepared.manifest`, not the draft; `runId` appears only after
  Preflight.
- `runStatsView`: each completeness verdict maps to its label and tone; Review
  reads "Read from chain" without a manifest and never counts `unexpected`
  rows then (the rule `Reconciliation.tsx` has today); an unreadable token
  gets raw-integer text.
- `no-legacy-css`: passes after §5, and fails on a planted alias (checked
  once by hand while writing it).

### 7.2 Browser (Playwright against `next start`)

- axe: no `serious` or `critical` violations on all seven routes in both
  themes, including `/run/[tx]` in the ready state and `/r/[tx]` Verified.
- Horizontal overflow is 0 at 390, 768 and 1280 on every route.
- `/new` at 390px: the summary is above the step content. At 1280px: it is
  to the right of it and stays in view while scrolling a long preview.
- Keyboard: every control inside the new Panels shows a visible focus.
- With token metadata reads blocked (`route.abort` on `eth_call` for
  `decimals`), `/run/[tx]` shows raw integers, not wrong decimals.
- Screenshots of every route at 390 / 1280 in both themes, kept with the
  verification notes.

### 7.3 Money flow (real testnet run)

One run through the migrated `/new`: upload → Preview → Preflight → Send →
Result, then the receipt link opened in a fresh profile reads **Verified
5/5**. During Send, disconnect is disabled and the summary shows the
manifest's totals. The run's amounts on `/run/[tx]` equal the dashboard's
for that run.

### 7.4 Done means

- §7.1–7.3 pass; `pnpm test`, `pnpm typecheck` and `next build` are clean.
- No page uses `.sheet`; no alias exists; no `?? 6`.
- Commits follow the order: shared pieces → `/r/[tx]` → `/run/[tx]` → `/new`
  → `/runs` → `/` → `/why` → CSS clean-up and guard. Each commit leaves the
  app working. Nothing is pushed.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Re-laying-out `/new` disturbs the send path | `CreateRun` changes only its wrapper; step state, the hold and `sendStaysOnScreen` are untouched. §7.3's real run tries a disconnect mid-send |
| The summary shows something other than what is signed | At Send it reads `prepared.manifest`; `runSummaryView` has a test for exactly this |
| `dense` placement reorders content elsewhere | Opt-in on one grid only; the 390/1280 checks cover `/new` |
| Removing an alias leaves a colour unset | The guard test plus axe in both themes on every route |
| Receipt layout change confuses recipients with old links | URLs and content are unchanged; §7.3 opens a real receipt link |

## 9. Out of scope

New pages, new copy beyond the labels named here ("Example", "To pay", the
tile labels), charts, settings, i18n. Any change to core or the contract.
