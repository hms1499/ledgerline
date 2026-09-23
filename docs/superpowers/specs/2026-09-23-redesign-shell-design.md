# Redesign, part 1 — Design system and app shell

A dark, dashboard-style web3 interface for Ledgerline on a 12-column grid, with
a shared app shell for the payer's routes and a lighter public shell for the
pages outsiders open.

**Parent specs:** `2026-09-21-ledgerline-design.md` (product, chain
constraints) and `2026-09-21-create-run-design.md` (the payer flow). Nothing
here changes core, the payout sequence, or any invariant in `CLAUDE.md`. This
is presentation and composition only.

---

## 1. Decisions already made

| Question | Decision |
|---|---|
| Visual direction | Dark DeFi dashboard, palette **B "Settlement blue"** |
| Theme | Dark by default, follows the system when the user has not chosen, toggle in the shell, choice remembered |
| Home | `/` stays the public landing page; a new `/dashboard` is the payer's home (built in part 2) |
| Layouts | Two: **App** (sidebar, wallet) and **Public** (top bar only, no wallet) |
| Implementation | Keep antd v6 (the stack in `CLAUDE.md`), own CSS-grid 12-column system, Next.js route groups |
| Mobile navigation | Bottom tab bar |
| Typography | IBM Plex Sans for text, IBM Plex Mono for figures and addresses (already loaded) |

## 2. The redesign is three parts

Each part gets its own spec, plan and implementation cycle.

1. **Design system and shell** — this document.
2. **`/dashboard`** — runs sent from this browser, per-token totals, each run
   re-read from chain by its txHash. Separate spec.
3. **Page migration** — move `/`, `/new`, `/runs`, `/run/[tx]`, `/r/[tx]` and
   `/why` onto the 12-column grid. Separate spec.

Part 1 must leave the app fully working: every existing page renders inside
the right shell and in the new theme, even before part 3 rebuilds its layout.

### Out of scope for all three parts

Settings page, i18n, real-time notifications, any backend. Aggregate figures
come only from this browser's run history plus chain reads by known txHash —
`CLAUDE.md` forbids flows that search chain history.

---

## 3. Route structure

URLs do not change, so receipt links already sent keep working.

```
app/
  layout.tsx               html/body, fonts, AntdRegistry, ThemeProvider
  (public)/layout.tsx      PublicShell
    page.tsx               /
    r/[txHash]/page.tsx    /r/[txHash]
    why/page.tsx           /why
  (app)/layout.tsx         AppShell + WalletProvider
    dashboard/page.tsx     /dashboard   (placeholder until part 2)
    new/page.tsx           /new
    runs/page.tsx          /runs
    run/[txHash]/page.tsx  /run/[txHash]
components/shell/
  AppShell, PublicShell, SideNav, TopBar, BottomTabs,
  NetworkBadge, WalletButton, ThemeToggle
lib/
  theme-tokens.ts          the two palettes — single source of truth
  theme.ts                 cookie parsing, antd ThemeConfig per mode
  nav.ts                   nav items and active-route matching
  wallet-session.ts        pure state logic behind WalletProvider
components/grid/
  Grid, Col
```

### Public shell — `/`, `/r/[tx]`, `/why`

Top bar only: logo, "How it works", `NetworkBadge`, "Open app" (links to
`/dashboard`), `ThemeToggle`. No wallet: a recipient opening a receipt link
needs to read, not connect.

### App shell — `/dashboard`, `/new`, `/runs`, `/run/[tx]`

Sidebar (Dashboard, New payout, Runs; "How it works" under a Learn group;
theme toggle at the foot) and a top bar (page title left; `NetworkBadge` and
`WalletButton` right).

## 4. Wallet moves into the shell

Today three places hold wallet state on their own: `CreateRun`, `RunHistory`,
and link recovery inside `Reconciliation`. A wallet button in the top bar needs
one shared `WalletProvider` for the `(app)` group, owning connect, the wallet
picker, chain switching and disconnect.

**The rule that must survive the move.** While `StepSend` holds the only copy
of a transaction hash, the wallet must not be dropped: unmounting the screen
between "signed" and "receipt" loses the evidence for money that has moved.
`CreateRun` enforces this today with `sending` and `forgetQueued`. The provider
takes this over:

- A **hold** that `StepSend` sets while it holds a hash.
- While held, the top bar's disconnect is disabled, and an account change from
  the wallet is **queued**, then applied when the hold is released — the same
  behaviour as now.
- A chain change or account change still invalidates a prepared run (the salt
  is bound to account and chain); a confirmed run is kept.

The state transitions live in `lib/wallet-session.ts` as pure functions so they
can be unit tested; the provider is a thin React wrapper around them.

**Link recovery keeps its own wallet choice.** It must be signed by the wallet
that paid, which may not be the one connected in the shell.

## 5. Theme and tokens

### 5.1 Tokens

One module, `lib/theme-tokens.ts`, exports both palettes. Contrast ratios are
WCAG 2 against the page background, computed during design.

| Token | Use | Dark | Light |
|---|---|---|---|
| `bg` | Page | `#0B1220` | `#F5F7FB` |
| `surface` | Cards, tables | `#101929` | `#FFFFFF` |
| `raised` | Active nav, hover | `#15213A` | `#E8EFFB` |
| `sidebar` | Sidebar, tab bar | `#080E1A` | `#EEF2F8` |
| `border` | Decorative rules and dividers | `#1B2436` | `#DCE3EE` |
| `control` | Boundaries of inputs, buttons, wallet chip — ≥ 3:1 (WCAG 1.4.11) | `#5F7090` — 3.5 on surface | `#7C889E` — 3.6 on surface |
| `text` | Body | `#E4E9F2` — 15.4 | `#0E1726` — 16.8 |
| `textSoft` | Secondary, labels | `#98A3B8` — 7.4 | `#4F5B70` — 6.4 |
| `link` | Links, active nav | `#7FB0FF` — 8.5 | `#1A56C4` — 6.2 |
| `accent` | Primary button fill | `#4C8DFF` | `#1F5FD6` |
| `onAccent` | Text on accent | `#051024` — 5.9 | `#FFFFFF` — 5.7 |
| `success` | Matched, verified | `#5EE0A0` — 11.3 | `#0B6E48` — 5.9 |
| `warning` | Testnet, to review | `#F2C35B` — 11.4 | `#7A5000` — 6.6 |
| `danger` | Error, reverted, short | `#FF8C9B` — 8.5 | `#B0222E` — 6.3 |
| `successBg` / `warningBg` / `dangerBg` | Tag and alert fills | `#0F3326` / `#33290F` / `#3B1720` | `#E2F4EC` / `#FBF0D9` / `#FBE4E6` |

Every status colour also clears 4.5:1 on its own tinted fill, and on `surface`
and `raised`. Links are always underlined, so colour is never the only signal.

`border` is for decorative rules only, which WCAG exempts. Anything a user
must see to operate — an input's edge, an outline button, the wallet chip —
uses `control`, which clears 3:1 against `bg` and `surface` in both themes.
The first draft used a darker rule colour for inputs; it measured 1.33 (dark)
and 1.51 (light) and was replaced.

### 5.2 Three consumers, one source

1. **CSS variables** — `--bg`, `--surface`, `--text`, `--link`, … under
   `html[data-theme="dark"]` and `html[data-theme="light"]`.
2. **antd `ThemeConfig`** per mode — `darkAlgorithm` or `defaultAlgorithm`,
   with `colorPrimary`, `colorLink`, `colorText`, `colorTextSecondary`,
   `colorBgBase`, `colorBgContainer`, `colorBorder`, `colorSuccess`,
   `colorWarning`, `colorError`, and component tokens for Tag, Steps (the
   waiting title), Table and Alert. This removes the audit's off-palette
   `#1677ff` links and low-contrast tags and step titles.
3. **A contrast test** over the token module (§8).

### 5.3 No flash

antd computes colour in JavaScript, so a client-only switch flashes. Instead:

- The user's choice is a cookie, `theme` = `dark` | `light` | `system`.
- `app/layout.tsx` reads it on the server and renders the right `data-theme`
  and antd algorithm into the first HTML.
- With `theme` missing or `system` and no `theme-system` yet (a first
  visit), the server renders **dark**, and a small inline
  script in `<head>` sets `data-theme` from `prefers-color-scheme` before
  first paint, so our CSS never flashes.
- The same script writes the resolved system value to a second cookie,
  `theme-system` = `dark` | `light`. It never touches `theme`, so `system`
  keeps following the operating system. On the next request the server
  renders `theme-system` when `theme` is `system` or missing.
- **Accepted trade-off:** on the very first visit of someone whose system is
  light, antd components re-colour once after load. Every later visit renders
  correctly on the server; a system change is picked up one load later.
- Reading the cookie makes `/` dynamically rendered; it is currently static.
  Every other route is already dynamic.

### 5.4 Keeping the app working between parts

The current CSS variables (`--ground`, `--raised`, `--ink`, `--ink-soft`,
`--rule`, `--tick`, `--flag`, `--pending`) stay as **aliases** of the new
tokens. Pages not yet migrated (part 3) render in the new theme without being
touched. Aliases are removed at the end of part 3.

## 6. Grid and responsive behaviour

### 6.1 The grid

```tsx
<Grid>                                      // 12 columns, 24px gap, max 1200px, centred
  <Col span={12}>…</Col>
  <Col span={8} md={12}>…</Col>
  <Col span={4} md={12} sticky>…</Col>
  <Col start={4} span={6} sm={12}>…</Col>
</Grid>
```

CSS grid (`grid-column: <start> / span <n>`). Breakpoints:

| Name | Width | Default for `Col` |
|---|---|---|
| `lg` | ≥ 1024px | as given |
| `md` | 640–1023px | as given, else inherits `lg` |
| `sm` | < 640px | span 12, no start |

On `sm` the gutter is 16px. `sticky` applies only at `lg`.

### 6.2 Column plan per route (applied in part 3)

| Route | Shell | Columns at `lg` |
|---|---|---|
| `/` | Public | Hero 7 + ledger-line card 5 · three steps 4/4/4 · testnet note 12 |
| `/dashboard` | App | Stat tiles 4/4/4 (one per token, never pooled) · runs table 12 · empty state 12 |
| `/new` | App | Step bar 12 · step content 8 + sticky run summary 4 |
| `/runs` | App | Runs table 12 |
| `/run/[tx]` | App | Stats 3/3/3/3 · reconciliation table 12 · link recovery 8 |
| `/r/[tx]` | Public | Receipt centred, columns 4–9 |
| `/why` | Public | Comparison 12 · the two transactions 6/6 |

### 6.3 Navigation by width

- **≥ 1024px** — sidebar 232px, labels shown.
- **640–1023px** — sidebar collapses to 64px icons; labels as tooltips on
  hover and as visible text on keyboard focus.
- **< 640px** — no sidebar; a **bottom tab bar** with Dashboard, New payout,
  Runs. "How it works" and the theme toggle move into the wallet menu.
- The current route carries `aria-current="page"`, not colour alone.
- On `/new` at `< 640px` the step bar becomes one line: "Step 2 of 5 · Review".

### 6.4 Audit fixes that belong to the shell

- `/run` overflowed 122px at 390px: long tables sit in their own horizontal
  scroll container; the page never scrolls sideways.
- Shortened addresses broke mid-string ("0xe48A…7 / 32a"): they get
  `white-space: nowrap`.

### 6.5 Top bar

Page title left. Right: `NetworkBadge` (warning colour on testnet) and
`WalletButton`.

- Not connected: "Connect wallet" (opens the picker when more than one wallet
  is installed).
- Connected: the shortened address; its menu offers copy address, view on
  explorer, disconnect, and on mobile "How it works" and the theme toggle.
- On the wrong chain: the button takes the warning colour and reads "Switch to
  Arc testnet"; clicking it switches. This replaces the audit's two
  simultaneous primary buttons.

## 7. Error handling

Nothing new fails in part 1 beyond what exists. The shell surfaces what the
pages already handle:

- Wallet connect errors keep the three cases `CreateRun` distinguishes today —
  dismissed (info), smart-contract wallet (error), anything else (error) — now
  shown from the wallet menu.
- An unreadable or unknown `theme` cookie falls back to dark.
- If the inline theme script fails, the page stays dark and correct.

## 8. Testing and definition of done

### 8.1 Unit tests (vitest, part of `pnpm test`)

- **Tokens** — every text/background pair in both themes is ≥ 4.5:1,
  including each status colour on its tinted fill; `control` is ≥ 3:1 on
  `bg` and `surface`.
- **Theme** — cookie parsing: `dark`, `light`, `system`, missing and garbage,
  each with and without `theme-system`, resolve as specified; `ThemeConfig` per mode carries the token values.
- **Grid** — span, start and breakpoint props produce the right styles.
- **Wallet session** — while held, a disconnect is deferred, not dropped, and
  applies on release; an account change clears a prepared run but keeps a
  confirmed one; a chain change marks the wallet as on the wrong chain.
- **Nav** — the right item is active for every route, including dynamic ones
  such as `/run/0x…`.

### 8.2 Browser checks (Playwright against `next start`)

- **axe-core** on all seven routes in **both themes**: no `serious` or
  `critical` violations.
- **Horizontal overflow = 0** at 390, 768 and 1280px on every route.
- **No flash**: with a `theme=light` cookie, the server's first HTML carries
  `data-theme="light"` — checked with `curl`, not by eye.
- **Keyboard**: every stop in sidebar, bottom tabs and wallet menu shows a
  visible focus.
- **Money flow unchanged**: one real testnet run through the new shell, upload
  to receipt, receipt Verified 5/5; disconnect is disabled while sending.
- **Old URLs**: `/r/…`, `/run/…`, `/runs`, `/new` open the right page in the
  right shell.

### 8.3 Done means

- All of the above pass; `pnpm typecheck` and `next build` are clean.
- Every existing route renders in its shell; pages not yet migrated still read
  correctly in the new theme through the aliases.
- `/dashboard` in the nav reaches a "Coming next" placeholder until part 2.
- Commits are split by logical step. Nothing is pushed.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Moving wallet state breaks the "never lose the hash" rule | Pure `wallet-session` functions with tests for the hold, plus a real testnet run that tries to disconnect mid-send |
| antd dark algorithm derives colours that miss contrast | Component tokens set explicitly; axe in both themes is a done criterion |
| Route groups change layout nesting and break a page | Old-URL browser check; pages move without changing their own code in part 1 |
| Scope creep into part 3 | Part 1 does not re-lay-out any page's content; it only wraps pages in a shell |
