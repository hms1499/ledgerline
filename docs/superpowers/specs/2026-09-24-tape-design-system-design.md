# Tape — the Ledgerline design system

Ledgerline's interface rebuilt as an adding machine's paper tape on a desk:
two inks, one highlighter, a tear that means "this is the final answer". It
replaces the "Settlement blue" dark dashboard from part 1 of the redesign,
which measured and read as a generic, AI-made admin template.

**Parent specs:** `2026-09-21-ledgerline-design.md` (product, chain
constraints), `2026-09-23-redesign-shell-design.md` (shells, grid, wallet in
the shell, theme cookies), `2026-09-23-page-migration-design.md` (pages on the
grid). This spec keeps their structure and changes their look, their
horizontal layout rules and the home page. Nothing here changes core, the
payout sequence, the wallet-session rules or any invariant in `CLAUDE.md`.

Claims are tagged as in the parent spec: `[measured]` (run here and read),
`[docs]`, `[unverified]`.

---

## 1. Why

What made the current interface read as generic, from screenshots of `/`,
`/run` and `/r` on 2026-09-24:

1. Navy/slate ground with `#1F5FD6` blue: the default SaaS/DeFi palette,
   unrelated to what the product does.
2. IBM Plex Sans for everything; headings only differ by weight.
3. Every block is a white card, radius 8, 1px border; a row of four stat
   tiles; sidebar plus top bar. The admin template.
4. The two most recognisable tells: three numbered "How it works" cards, and a
   callout with a coloured left rule.
5. A text-only wordmark, and an `icon.svg` still in the pre-redesign green
   paper palette — two identities at once.

What was worth keeping: the pre-redesign app already had real seeds from the
product's own world — "the ledger line", "the tickmark ladder", an invoice
reference underlined like a document field. This system grows from there.

## 2. Decisions made

| Question | Decision |
|---|---|
| Direction | **Adding-machine tape** (chosen over ledger paper and security print) |
| How far the metaphor goes | **Every block is tape**; the tear edge carries meaning (§6.1) |
| Typefaces | **Martian Mono** for everything the machine prints; **Atkinson Hyperlegible** for prose |
| Colour | Two inks (black, red ribbon) and a highlighter; only exceptions get colour |
| Theme | **Light by default**; dark kept, designed with the same care; still follows the system |
| Logo | **✱**, the adding machine's total key |
| Horizontal layout | One shared frame, a three-step gutter, three page patterns |
| Implementation | Tokens first, antd kept, tape as a primitive (`Tape`) |
| Home | Hero, a "Pays in" row, a **Proof** tape of measured mainnet facts, how it works, an end-of-roll footer |

## 3. Principles

The world is an adding machine on a desk: the **desk** is the page, the
**tape** is every block, **ink** is black, the **ribbon** prints red, and
someone has a **highlighter**.

1. **Only exceptions get colour.** "Paid", "matched", "verified" are black ink
   with ✓ and words — the way an accountant marks only what disagrees. There
   is no success green.
2. **Red means wrong, short or failed.** It is the ribbon an adding machine
   prints negatives with. Never decoration.
3. **Highlighter means look at this.** Testnet, needs review, could not be
   checked, examples. Text on it is always dark, in both themes.
4. **Black ink does the work.** The primary button is a block of ink; links
   are ink, underlined; the focus ring is ink.
5. **Mono is for what the machine prints.** Figures, codes, labels, buttons,
   navigation. Sentences are always Atkinson; no paragraph is set in mono.
6. **Only labels change case.** Labels are uppercase through CSS. Data —
   token symbols, addresses, invoice ids, hashes — is never transformed:
   `cirBTC` stays `cirBTC`.
7. **The tear is a statement.** A torn edge means the answer is final; a
   straight, feeding edge means the machine is still printing or waiting for
   you (§6.1).

## 4. Tokens

### 4.1 Colour `[measured]`

One module, `lib/theme-tokens.ts`, stays the single source for the CSS
variables, the antd theme and the contrast test. Contrast is WCAG 2, computed
with the module's own `contrast()`.

| Token | Role | Light | Dark |
|---|---|---|---|
| `desk` | Page ground | `#E2E0DA` | `#121211` |
| `deskDeep` | Sidebar, bottom tabs | `#D6D3CB` | `#0B0B0A` |
| `tape` | Every block | `#FDFDFA` | `#262521` |
| `tapeShade` | Row hover, selected, inline code on tape | `#F0EEE8` | `#31302B` |
| `rule` | Dotted leaders and separators (decorative) | `#B9B7B0` | `#45433D` |
| `control` | Edges a user must see to operate — ≥ 3:1 | `#77756D` | `#8A877E` |
| `ink` | Text, primary rules | `#161616` | `#F2F1EC` |
| `inkSoft` | Secondary text, labels | `#55544F` | `#AEACA3` |
| `ribbon` | Wrong, short, failed | `#AC0D26` | `#FF7A7A` |
| `ribbonBg` | Tint behind a failed tag | `#FBE4E6` | `#3D1C1E` |
| `highlight` | Look at this (fill only) | `#FFE45C` | `#F4D63D` |
| `onHighlight` | Text on highlight, both themes | `#161616` | `#161616` |
| `warning` | antd warning icons only | `#6E5200` | `#F4D63D` |
| `accent` | Primary button fill (= ink) | `#161616` | `#F2F1EC` |
| `accentHover` | Primary button hover | `#3A3935` | `#CFCDC5` |
| `onAccent` | Text on accent | `#FDFDFA` | `#121211` |
| `focus` | Focus ring (= ink) | `#161616` | `#F2F1EC` |

Measured pairs:

| Pair | Light | Dark |
|---|---|---|
| `ink` on desk / deskDeep / tape / tapeShade | 13.71 / 12.10 / 17.76 / 15.60 | 16.57 / 17.41 / 13.56 / 11.69 |
| `inkSoft` on the same four | 5.75 / 5.07 / 7.45 / 6.54 | 8.24 / 8.65 / 6.74 / 5.81 |
| `ribbon` on the same four | 5.60 / 4.94 / 7.26 / 6.37 | 7.42 / 7.80 / 6.08 / 5.24 |
| `warning` on the same four | 5.54 / 4.89 / 7.18 / 6.31 | 12.97 / 13.63 / 10.62 / 9.15 |
| `ribbon` on `ribbonBg` | 6.11 | 6.01 |
| `onHighlight` on `highlight` | 14.22 | 12.52 |
| `onAccent` on `accent` / `accentHover` | 17.76 / 11.34 | 16.57 / 11.77 |
| `control` on desk / tape / tapeShade | 3.50 / 4.53 / 3.98 | 5.22 / 4.27 / 3.68 |
| `focus` on desk / tape | 13.71 / 17.76 | 16.57 / 13.56 |
| `tape` against `desk` (the tear must show) | 1.30 | 1.22 |

The lowest text pair is 4.89 (`warning` on `deskDeep`, light). `ink` on
`highlight` in dark is 1.28, which is why `onHighlight` exists and is the only
colour ever used on a highlight.

### 4.2 Colour rules

- A highlight is a **full background** behind the glyph box
  (`box-decoration-break: clone`), never a partial marker stroke: in dark, a
  stroke that covers half the line leaves dark text on dark tape.
- Links are `ink` and always underlined; hover thickens the underline.
- Status is never colour alone: ✓ / ✗ / ! plus words (the existing `sr-only`
  pattern stays).

### 4.3 Type

Both faces load through `next/font/google`. Next 16.3.5's font data lists a
`wdth` axis (75–112.5) for Martian Mono `[measured]`, loaded with
`axes: ["wdth"]`; Atkinson Hyperlegible ships 400 and 700.

| Role | Face | Size / line | Weight | Notes |
|---|---|---|---|---|
| `display` | Atkinson | clamp(32px, 4.4vw, 48px) / 1.06 | 700 | Public h1 only, `text-wrap: balance`, −0.018em |
| `amount` | Martian, wdth 100 | clamp(32px, 6vw, 48px) / 1 | 600 | Receipt headline figure, −0.03em |
| `figure-lg` | Martian | 34px / 1.05 | 600 | Proof tape |
| `h2` | Atkinson | 22px / 1.3 | 700 | Page-level headings in content |
| `figure` | Martian, wdth 87 | 22px | 600 | Stat tiles |
| `lede` | Atkinson | 17px / 1.6 | 400 | Home intro |
| `h3` | Atkinson | 17px / 1.3 | 700 | Step titles |
| `body` | Atkinson | 15px / 1.6 | 400 | antd `fontSize` stays 15 |
| `data` | Martian, wdth 87 | 13px | 400 | Codes, addresses, table figures |
| `small` | Atkinson | 13px | 400 | Footnotes, endpoints line |
| `label` | Martian, wdth 87 | 11px, +0.08em, caps | 500 (700 for tape titles) | Labels, tape heads, nav, buttons at 11–12px |

The scale is 11 · 13 · 15 · 17 · 22 · 34 · 48. Inline mono inside prose is
0.92em so it does not outgrow the sentence. `tabular-nums` stays the page
default. Atkinson's slashed zero is kept.

### 4.4 Space, lines, radius, elevation

- **Space scale:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
- **Lines, each with one job:**
  - `1.5px dashed ink` — a section rule inside a tape (under a tape head,
    above a total).
  - `1.5px dotted rule` — leaders between a label and its value, row
    separators, column dividers inside a tape.
  - `1.5px solid ink` — under a table's column headers.
  - `1px solid rule` — shell dividers (top bar, sidebar edge).
- **Radius:** 0 everywhere. Paper is cut square.
- **Elevation:** none, except popups (Modal, Dropdown, message), which really
  sit on top of the page:
  `0 1px 0 var(--rule), 0 12px 28px -12px rgb(0 0 0 / .35)`.

## 5. Horizontal layout

### 5.1 What it fixes `[measured]`

Seven routes at 390, 768, 1280, 1440 and 1920px, on 2026-09-24:

| Problem | 1280 | 1440 | 1920 |
|---|---|---|---|
| Public pages: header logo vs content edge | 64 vs 40 | 144 vs 120 | 384 vs 360 |
| App pages: page title vs content edge | aligned | aligned | 256 vs 476 |
| Content width between app pages | 659 / 1000 | 765 / 1160 | 792 / 1200 |

And a bug: below 1024px **public pages have no logo**. The rule that hides
the sidebar's brand at `md` (`.side-brand { display: none }`) also matches the
public bar's brand, which reuses the class.

### 5.2 Rules

1. **One frame.** Header content and page content sit in the same `.frame`:
   content up to 1200px, centred — in the app shell, centred in the area right
   of the sidebar. The top bar's background runs full width; its content sits
   in the frame. Logo, page title and content share one left edge at every
   width.
2. **Gutter** (`--gutter`, the frame's side padding): 16 (< 640) · 24
   (640–1023) · 32 (≥ 1024). Column gap: 16 · 24 · 24.
3. **Three page patterns; every route uses exactly one.** No page sets its own
   width.

   | Pattern | lg | md | sm | Routes |
   |---|---|---|---|---|
   | **Ledger** | 12 | 12 | 12 | `/dashboard`, `/runs`, `/run/[tx]`, `/why` |
   | **Split** | 8 + 4 | 12 | 12 | `/new` (sticky summary, which comes first on a phone as today), `/` (hero, then example) |
   | **Slip** | 6, columns 4–9 | 10, columns 2–11 | 12 | `/r/[tx]` |

4. **Text inside a tape lines up.** Tape padding is 20 (≥ 640) · 16 (< 640).
   A table's first and last cells use the same padding, so the first column's
   text sits under the tape's title.

The public brand gets its own class; the sidebar rule no longer reaches it.

## 6. Primitives and components

### 6.1 `Tape` (replaces `Panel`)

```tsx
<Tape title="Payments in this run" head={…} state="torn">…</Tape>
```

- A `<section>` on `tape`, labelled by its title, which is a real `<h2>` (or
  `<h3>`) styled as a label (§4.3). Same accessibility contract as `Panel`.
- **`state: "torn"` (default)** — scalloped tear, 6px, top and bottom: a
  finished answer. **`state: "feeding"`** — torn top, straight bottom with a
  3px dashed feed line that runs while motion is allowed: the machine is still
  printing, or waiting for input.
- A feeding tape becomes torn when its answer arrives: reconciliation while
  loading is feeding, then torn. The whole `/new` flow is feeding; its Result
  is torn.
- Edges are pseudo-elements painted in `--tape` (radial-gradient scallops); no
  content, no extra DOM. The gap between tapes (16 / 24) always exceeds the
  two 6px edges.
- `head` renders the printed header: label left, meta right, dashed ink rule
  below.
- Wide content scrolls inside the tape (its own `overflow-x: auto`
  container); the edges never scroll.
- Sample data on a tape carries a highlighted **Example** label in its head.

### 6.2 Adding-machine marks

Real key marks, used only in totals slips and the proof tape, never scattered
through tables, and `aria-hidden` wherever they sit beside words:

| Mark | Meaning | Example |
|---|---|---|
| `◇` | Subtotal | one line per token — never pooled |
| `✱` | Total | the run's bottom line, the logo |
| `#` | Non-add number | block numbers, invoice ids, contract and tx hashes |

### 6.3 Components

| Component | Becomes |
|---|---|
| `Panel` | **`Tape`** (renamed; every use site updated) |
| `StatTile` | A small torn tape: label, `figure`, optional sub line. Name kept |
| `Verdict` | A printed stamp line `*** VERIFIED ***` (the `***` are `aria-hidden`) and one Atkinson sentence below. `ok` = ink, `error`/`critical` = ribbon, `degraded` = on highlight. Heading level rules unchanged |
| **`Totals`** (new) | The totals slip: one `◇` line per token, dotted leaders, an optional `✱` total line. Used in the `/run` Payments stat and the `/new` summary. (`/dashboard` already has one stat per token; Result has no per-token totals) |
| Alert glyphs | Alert as a tape with a margin glyph: `i` info, `✓` success, `!` on highlight for warning, `✗` in ribbon for error. Set once through `ConfigProvider`'s `alert.{info,success,warning,error}Icon` (antd 6.6.5, `[measured]` from its types), so no wrapper and no call-site changes |
| **`Mark`** (new) | The ✱ logo as inline SVG: three square-capped bars at 0°, 60°, 120° |
| Receipt ladder | Printed lines: label left, ✓ / ✗ / – at the right margin. Long labels wrap with a hanging indent; the mark stays with the first line |

**Logo.** Wordmark `✱ LEDGERLINE`: `Mark` plus Martian 800, +0.16em, caps.
`app/icon.svg` becomes the ✱ in `ink` on `tape`; it must read at 16px.

### 6.4 antd, through `ConfigProvider`

Tokens first; CSS only where a token cannot reach.

| antd | Treatment |
|---|---|
| Global | Every `*Radius` token 0; `fontFamily` Atkinson, `fontFamilyCode` Martian, `fontSize` 15; `colorPrimary` = `colorLink` = `colorInfo` = ink; `colorSuccess` = ink (only exceptions get colour); `colorWarning` = `warning`, `colorWarningBg` = `highlight`; `colorError` = `ribbon`, `colorErrorBg` = `ribbonBg`; `colorBgLayout` = desk, `colorBgContainer` = `colorBgElevated` = tape; `colorBorder` = control, `colorBorderSecondary` = rule; box shadows off except popups |
| Button | Primary: ink block, `onAccent` text, Martian caps 12px +0.06em, hover `accentHover`, 1px press. Default: transparent with a `control` edge. Danger: ribbon |
| Table | Header: Martian caps 10.5px `inkSoft`, `1.5px solid ink` below. Rows: dotted `rule`, hover `tapeShade`. Footer: `1.5px dashed ink` above. First and last cells padded 20 (§5.2 rule 4) |
| Tag | Paid/ok: ink ✓, no fill. Review/unknown: highlight fill. Failed: `ribbonBg` fill, ribbon text. Martian caps 10.5px, radius 0 |
| Alert | Glyph icons from `ConfigProvider` (above). A standalone Alert (a direct child of a grid column) is a torn tape; one inside a tape is flat |
| Steps (`/new`) | Martian caps; current `▸` in ink, done `✓`, waiting `inkSoft`; connectors dashed |
| Upload.Dragger | A feed slot: dashed `control` edge on tape; copy unchanged |
| Input | Tape ground, `control` edge, radius 0, focus ring ink 2px |
| Segmented (theme) | Martian caps; selected item is an ink block |
| Modal, Dropdown, message | Square, tape ground, the popup shadow: the only elevated surfaces. Modal also gets torn edges; Dropdown and message do not, because antd uses their `::before`/`::after` itself `[measured]` |
| Skeleton | Inside a feeding tape, bars in `tapeShade` |
| Collapse (receipt) | Martian caps header, `▸` / `▾` |

### 6.5 Shells

- **Sidebar** (`deskDeep`): `✱ LEDGERLINE`, nav in Martian caps, current item
  ink with `▸` and `aria-current="page"`. Icons get square caps. Collapses to
  64px icons at `md` as today.
- **Top bar**: page `h1` in Martian caps 14px; `NetworkBadge` and
  `WalletButton` right. Content in the frame (§5.2).
- **Public bar**: `✱ LEDGERLINE` (its own class), How it works, network badge,
  theme toggle, **Open app** as an ink button.
- **NetworkBadge**: mainnet = `control` outline, `inkSoft` text; testnet =
  highlight fill.
- **WalletButton**: connected = the address in Martian with a `control` edge;
  wrong chain = highlight fill, "Switch to Arc testnet".
- **Bottom tabs** (< 640): `deskDeep`, Martian caps labels; current tab ink
  with a 2px ink rule on its top edge.

## 7. Pages

### 7.1 Home `/` — Split, then Ledger

Learned from credible.finance's *structure*, not its look: one thesis per
screen, a row that states scope right under the actions, and a row of figures
as proof. Not taken: the centred sans-plus-italic-serif headline, glowing
gradient ground, pill buttons and chips, floating glass nav.

1. **Hero** (8 + 4).
   - Left: label "Batched stablecoin payouts on Arc"; `display` h1 "A payment
     that carries its own invoice"; the `lede`; **Create a payout run** (ink
     button) and "Open your dashboard".
   - **Pays in**: `USDC 6 dp` · `EURC 6 dp` · `cirBTC 8 dp` as square
     `control`-edged chips. No wallet line here.
   - **Mainnet line**, beside the action it guards: `!` on highlight, "This is
     Arc mainnet: a run moves real money. Try it on testnet first." On
     testnet, the existing faucet sentence in the same form.
   - Right: the example receipt as a torn tape, highlighted **Example** in its
     head, "What a recipient sees" below.
2. **Proof · Arc mainnet** (12), a torn tape, four columns split by dotted
   rules. Every figure is from `docs/notes/2026-09-24-mainnet-proof.md`
   `[measured]`:

   | Figure | Label | Line |
   |---|---|---|
   | `3 ◇` | Tokens, one transaction | 0.10 USDC · 0.10 EURC · 0.00001 cirBTC, each carrying its invoice |
   | `5 ✓` | Checks on every receipt | Run in the recipient's own browser, against the chain. No account, and nothing from us |
   | `0.0056` | USDC in fees, all three | 266,370 gas at 21 Gwei, measured on the run itself |
   | `0 / 1` | Referenced by a plain batch | The same payment through the standard Multicall3, same day, as a control |

   Head: "Proof · Arc mainnet" / `# block 22,453,870 · 2026-09-24`. Foot:
   `# 0xaf3e6194…e738e4c0 ✱` and three links — View on explorer ↗, Open the
   run here (`/run/0xaf3e…?n=mainnet`), Compare with the control (`/why`).

   The values live in one module, `lib/mainnet-proof.ts`, with the note as its
   cited source. They are facts about one mainnet transaction, so the tape
   shows them — labelled mainnet — on testnet too. A unit test checks the tx
   hash matches the note and the README, so the three cannot drift.
3. **How a run works** (12): one torn tape, three columns split by dotted
   rules, `1 · UPLOAD`, `2 · CHECK, THEN PAY`, `3 · SEND RECEIPTS`. The
   numbers stay because the order is real. Copy as today.
4. **Site footer** (§7.4).

Removed: the separate mainnet notice block, the three step cards, and the
line "Your wallet signs directly, so it must be an ordinary wallet such as
MetaMask or Rabby…". The smart-contract-wallet limit is still stated where the
payer acts — the Review step of `/new` (`StepPreview.tsx`), as `CLAUDE.md`
requires — and every installed browser wallet is already offered through
EIP-6963.

### 7.2 Receipt `/r/[tx]` — Slip

One torn tape, top to bottom: head "Payment advice" / `Arc testnet · # <block>`;
`INVOICE … # INV-EU-002` and `TO … 0xe48A…732a` as leader lines; the `amount`
right-aligned with its symbol; dashed rule; the verdict stamp and its
sentence; dashed rule; the five checks as printed lines (labels from core,
uppercase by CSS only); Payment detail and Raw evidence as `Collapse`. Below
the tape, on the desk: the endpoints line and "change", and the paragraph on
pointing the page at your own node. The ladder prints in (§8). No site footer.

### 7.3 App pages

- **`/run/[tx]`** (Ledger): stat tapes 3/3/3/3, the notice tape, the payments
  table in a torn tape (feeding while loading), link recovery 8 columns.
  Per-token figures use `Totals`.
- **`/new`** (Split): step bar 12; step content 8 in a feeding tape; the
  sticky summary 4 as `Totals`. Result becomes a torn tape.
- **`/dashboard`** (Ledger): one stat tape per token — never pooled — then the
  runs table.
- **`/runs`** (Ledger): the runs table.
- **`/why`** (Ledger): comparison 12, the two transactions 6 / 6, site footer.

### 7.4 Site footer — `/` and `/why` only

The last tape on the page, torn, two columns (2 : 1) split by a dotted rule:

- Head: `✱ LEDGERLINE` / the current network and its chain id, e.g.
  `Arc mainnet · chain 5042` (from `lib/chain.ts` and viem's chain).
- **Check it without us**: `pnpm reconcile <tx>` in a copyable box (`tapeShade`
  ground, a Copy button that falls back to selecting the text), then "Rebuilds
  any run's table from the chain alone. Receipts do the same in the
  recipient's own browser."
- **Read more**: How this differs from an ordinary batch (`/why`), Source code,
  and the recorded-list contract on the explorer ↗.
- End line, dashed rule above: `# Recorded lists 0xd483…0890 · verified
  source` / `Never holds funds · no admin · no upgrades` (invariant 3). The
  address is the current network's `anchor` from `lib/chain.ts`; it comes from
  an env variable and may be unset, in which case the address and its
  explorer link are left out and the three promises stay.
- Closing `✱ ✱ ✱`, `aria-hidden`.

Public copy follows the plain-language rule in
`test/plain-language.test.ts`: the contract is "recorded lists", not
"PayoutAnchor".

## 8. Motion

- **Print-in**: on `/r`, the five checks appear one after another, 70ms
  apart, each fading in with a 4px upward feed (the existing `settle`
  animation, reshaped). It is honest because the checks really are
  sequential.
- **Feed line**: runs only while a tape is `feeding`. The switch to `torn` is
  immediate; there is no tearing animation.
- **Key press**: buttons move 1px down while pressed.
- Nothing else: no hover lifts, no page transitions, no scroll reveals.
- Under `prefers-reduced-motion: reduce`, all of the above is static.

## 9. Accessibility

- Uppercase only through `text-transform`; headings are real elements.
- Decorative glyphs — `✱ ◇ # ***`, dotted leaders, tear edges — are
  `aria-hidden` or pseudo-elements. ✓ / ✗ / – keep their spoken equivalents.
- One focus ring everywhere: `2px solid var(--focus)`, offset 2 (inset where a
  table's scroll edge would clip it), forced over antd's own where antd draws
  a weaker one — the same list of selectors as today.
- Text on a highlight is always `onHighlight`, on a full background.
- axe: no `serious` or `critical` violations on all seven routes in both
  themes.

## 10. Theme infrastructure

- `Palette` takes the §4.1 names. CSS variables follow in kebab case
  (`--desk`, `--desk-deep`, `--tape`, `--tape-shade`, `--rule`, `--control`,
  `--ink`, `--ink-soft`, `--ribbon`, `--ribbon-bg`, `--highlight`,
  `--on-highlight`, `--warning`, `--accent`, `--accent-hover`, `--on-accent`,
  `--focus`). Every consumer is updated: `globals.css`, `lib/theme.ts`, and
  the inline `var(--…)` uses in `Dashboard`, `StepUpload`, `Reconciliation`,
  `RunHistory` and `Why`.
- `resolveTheme`: a missing or unknown cookie with no `theme-system` renders
  **light**; the boot script and cookies are unchanged. The accepted
  trade-off flips: a first-time visitor whose system is dark sees antd
  re-colour once after load.
- `next/font`: Martian Mono (variable, `axes: ["wdth"]`) as `--font-mono`,
  Atkinson Hyperlegible 400/700 as `--font-sans`; IBM Plex is removed.

## 11. Testing and definition of done

### 11.1 Unit (vitest, in `pnpm test`)

- **Tokens**: every text role (`ink`, `inkSoft`, `ribbon`, `warning`) on every
  ground (`desk`, `deskDeep`, `tape`, `tapeShade`) ≥ 4.5; `ribbon` on
  `ribbonBg`, `onHighlight` on `highlight`, `onAccent` on `accent` and
  `accentHover` ≥ 4.5; `control` on `desk`, `tape` and `tapeShade` ≥ 3;
  `focus` on `desk` and `tape` ≥ 3; `tokenCss` emits every token for both
  themes.
- **Theme**: `resolveTheme(undefined, undefined)` is light; the antd config
  carries the §6.4 values (radius 0, primary = ink, success = ink).
- **Guards** (`no-legacy-css.test.ts`), rewritten:
  - the forced focus ring is `var(--focus)` on the same selectors;
  - no retired colour name remains — the part-1 names (`--bg`, `--surface`,
    `--raised`, `--sidebar`, `--border`, `--text`, `--text-soft`, `--link`,
    `--success`, `--danger`, `--success-bg`, `--warning-bg`, `--danger-bg`)
    and the pre-redesign ones not brought back (`--ground`, `--tick`,
    `--flag`, `--pending`, `--ruleStrong`). `--ink`, `--ink-soft` and `--rule`
    are real tokens again, so the old guard against them is replaced;
  - no `border-radius` other than 0 in `globals.css`.
- **Proof**: the tx hash in `lib/mainnet-proof.ts` appears in
  `docs/notes/2026-09-24-mainnet-proof.md` and in `README.md`.
- Existing grid, nav, wallet-session and plain-language tests pass unchanged.

### 11.2 Browser (Playwright against `next start`)

- axe on the seven routes, both themes: no `serious` or `critical`.
- **Alignment**: the §5.1 measurement re-run at 390 / 768 / 1280 / 1440 /
  1920 — header brand or page title left edge equals the content's left edge
  on every route; the public logo is visible at every width.
- **Overflow**: horizontal overflow 0 on every route at those widths.
- **No flash**: `curl` with no cookie returns `data-theme="light"`; with
  `theme=dark`, `dark`.
- **Keyboard**: every stop in the sidebar, bottom tabs, wallet menu and the
  footer's Copy button shows the ink ring.
- **Money flow unchanged**: one real testnet run through the new interface,
  upload to receipt, receipt Verified 5/5; disconnect disabled while sending.
- `.playwright-mcp/` emptied afterwards, except `axe.min.js`.

### 11.3 Done means

All of the above pass; `pnpm test`, `pnpm typecheck` and `next build` are
clean; every route renders in the new system in both themes. Commits are
split by logical step. Nothing is pushed.

## 12. Order of work

Each step leaves the app working and is its own commit.

1. Tokens and theme infrastructure, tests first (§4.1, §10, §11.1).
2. Fonts, `Mark`, favicon.
3. Frame and shells, including the hidden-logo fix (§5, §6.5).
4. `Tape`, `StatTile`, `Verdict`, `Totals` (§6.1–6.3).
5. antd component tokens and the CSS they cannot reach (§6.4).
6. Pages, in order: `/r` (what a judge is most likely to open), `/`,
   `/run`, `/new`, `/dashboard`, `/runs`, `/why`.
7. Verification pass (§11.2).

## 13. Risks

| Risk | Mitigation |
|---|---|
| `next/font` and Martian Mono's `wdth` axis | Resolved: Next 16.3.5's font data lists `wdth` 75–112.5 for Martian Mono `[measured]`; load it with `axes: ["wdth"]` |
| antd internals move between minor versions | Selectors are checked against antd 6.6.5's own style source; the browser pass (§11.2) catches a miss |
| "Every block is tape" flattens hierarchy | The tear carries state; only exceptions get colour; the stamp and the amount are the only large elements on a receipt |
| Martian Mono is wide; many-column tables on phones | Tables scroll inside their own tape, as today |
| Renaming tokens misses a consumer | The guard test names every retired variable; `typecheck` catches `Palette` keys |
| The first dark-system visit re-colours antd once | Accepted (§10); later visits render right on the server |

## 14. Out of scope

Mobile wallets (WalletConnect) — a feature, not a design change; smart-contract
wallets cannot pay on Arc at all. Also: an Open Graph image, i18n, new routes,
and any change to what a page says beyond §7.1 and §7.4.
