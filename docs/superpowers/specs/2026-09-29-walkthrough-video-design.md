# Walkthrough video — the whole workflow on Arc mainnet, with a camera that zooms

A 2½-minute video for the Arc Microgrants submission on DoraHacks: one real
payout run on Arc mainnet, from a CSV with mistakes in it to the recipient's
verified receipt, the run's reconciliation and the payer's dashboard. The
camera zooms to whatever the viewer should be reading, the way a screen
recording tool such as Screen Studio does, and captions carry the story over
background music.

**Parent specs:** `2026-09-21-ledgerline-design.md` (invariants),
`2026-09-24-tape-design-system-design.md` (the look captions borrow). The home
page's demo (`scripts/record-demo.ts`, `docs/notes/2026-09-28-demo-video.md`)
is the precedent this builds on. Nothing here changes the app, core, the
contract or any invariant in `CLAUDE.md`.

Claims are tagged `[measured]`, `[docs]`, `[unverified]`, as in the parents.

---

## 1. Decisions

Made with the maintainer on 2026-09-29:

| Question | Decision |
|---|---|
| Who it is for | Judges, through the DoraHacks BUIDL page (YouTube link). 16:9, 1920×1080, about 2:25 |
| Sound | Captions on screen and background music the maintainer supplies. No voice |
| What it shows | The payer's flow, the Safe treasury funding block, the dashboard, the recipient's receipt and the run's reconciliation. Not `/why`, not the CLI, no end card |
| Network | **Arc mainnet.** Rehearsals run on testnet with the same script |
| Amounts | Small: 0.02 USDC, 0.01 EURC and 0.0000001 cirBTC per take, so no top-up is needed |
| Zoom | Applied after recording, on 4K frames (approach A below) |

Approaches considered for the zoom:

- **A, chosen: record once, zoom in post.** The app renders untouched; the
  camera is computed afterwards from events the script logs. Re-framing costs
  a render, never another mainnet payment.
- B: CSS transforms in the page while recording. Crisp and simpler, but a
  transformed ancestor breaks the fixed header, the sidebar and antd's
  positioned popovers, and every change of framing is a new mainnet take.
- C: record raw and keyframe by hand in an editor. Not reproducible, and
  Screen Studio is paid.

## 2. Funds

The demo wallet `0x5955…de17` on Arc mainnet, read 2026-09-29 `[measured]`:

| Token | Held | Per take |
|---|---|---|
| USDC | 2.651207 | 0.02, plus about 0.007 in fees |
| EURC | 0.10807 | 0.01 |
| cirBTC | 0.00000084 | 0.0000001 (10 sat) |

cirBTC bounds it at 8 takes, EURC at 10. The proof run's amounts (0.10 / 0.10
/ 0.00001) are out of reach: cirBTC holds 84 sat of the 1,000 one take needs.

Every take pays `DEMO_RECIPIENT` from `.env`, under its own run name
(`video-<date>-t<n>`). The salt is the payer's signature over
`ledgerline-run-salt:v1:5042:<run name>`, so a fresh name never shares the
published proof run's salt (`mainnet-2026-09`).

## 3. Storyboard

About 2:25. Durations are targets for the finished video, after waits on the
network are played faster.

| # | Scene | Target | The camera holds on |
|---|---|---|---|
| 0 | Title card: name, one-line positioning, "Recorded on Arc <network>, <date>", both read from the take's `events.json`, so a testnet rehearsal can never be labelled mainnet | 4s | — |
| 1 | Home: the hero, "Pays in USDC · EURC · cirBTC" | 8s | the headline, then the token strip |
| 2 | New payout: the CSV dropped in | 10s | the drop zone |
| 3 | Review: the problems list; "USD" fixed with one click on **USDC** | 20s | the problem card, then the fixed cell |
| 4 | Connect the wallet. *Can this wallet pay it?* EURC is short; the Safe treasury block says what to send; the EURC amount is trimmed in the grid; every token reads ✓ | 18s | the short row, the treasury block, the amount cell |
| 5 | Check against the chain: sign the run name, every payment simulated | 15s | the per-line results |
| 6 | Pay: one transaction, "Paid, with a receipt", the run file saved, receipt links | 15s | the result heading, the links |
| 7 | The recipient's receipt: **Verified**, then each of the six checks in turn | 20s | each check |
| 8 | The run page: the saved run file loaded, "matches the recorded list", All matched, Complete | 15s | the status column, the completeness tile |
| 9 | Dashboard: Needs you, each token's balance beside what it paid this month | 12s | each block |

The CSV, per take:

```csv
invoiceId,token,to,amount
INV-V-001,USDC,<DEMO_RECIPIENT>,0.01
INV-V-002,USD,<DEMO_RECIPIENT>,0.01
INV-V-003,EURC,<DEMO_RECIPIENT>,25
INV-V-004,cirBTC,<DEMO_RECIPIENT>,0.0000001
```

`USD` is an unknown token: the Review step groups it into a card whose actions
are USDC, EURC and cirBTC (`frontend/test/fix-list.test.ts`) `[measured]`.
`25` EURC is more than the wallet holds, which is what makes the treasury
block appear; it is trimmed to `0.01` in the grid.

## 4. Recording

`scripts/record-walkthrough.ts`, run against `next start`:

```text
pnpm exec tsx scripts/record-walkthrough.ts --network testnet
pnpm exec tsx scripts/record-walkthrough.ts --network mainnet --confirm-mainnet
```

- **The demo wallet is shared, not copied.** The EIP-6963 stand-in and its
  Node-side signer move from `record-demo.ts` into
  `scripts/lib/demo-wallet.ts`, and both scripts use it. It is the code that
  refuses a fee under 25 Gwei; two copies of it could drift.
- **Mainnet is opt-in twice.** `--network mainnet` without `--confirm-mainnet`
  exits before opening a browser. With it, the script prints the take's spend,
  reads the wallet's balances and exits if any token or the fee is not covered.
- **Frames.** Viewport 1920×1080 CSS pixels at device scale 2: 3840×2160
  frames through the CDP screencast `record-demo.ts` already uses, JPEG. If the
  testnet rehearsal measures too few frames per second, device scale 1.5
  (2880×1620) and a zoom capped at 1.5× instead `[unverified]`.
- **The script logs; it does not zoom.** `focus(locator, { zoom? })` records
  the time and the element's box in viewport pixels, `wide()` returns to the
  full frame, `caption(step, text)` records a caption. Waits on the network use
  the existing playback-speed timeline (`scripts/lib/timeline.ts`).
- **A pointer the viewer can follow.** A small arrow drawn in the page, fixed
  and ignoring pointer events, glides to each target before Playwright's real
  click and shows a ripple on it. It imitates no wallet and no operating system.
- **A take is a folder**, gitignored: `video/takes/<run name>/frames/` and
  `events.json` (network, run name, transaction hash, frame times, focus and
  caption events, waits). Rendering reads only the folder, so it can run any
  number of times.

## 5. Camera and render

`scripts/render-walkthrough.ts <take> [--music <file>]`.

- **`cameraAt(t, focuses)`** — a pure function in `scripts/lib/camera.ts`
  returning the frame's centre and scale. A focus is framed with padding, at
  most 2× (1.5× at device scale 1.5), clamped so the crop never leaves the
  frame. Moves between framings ease in and out over 0.7s; a focus holds until
  the next one. Unit-tested like `timeline.ts`.
- **Driven by the output clock.** The screencast sends a frame only when the
  page changes, so a zoom over a still page would have one frame to show. The
  render steps through the video at a constant 30 fps; each output frame takes
  the latest source frame at that moment, crops it by the camera and scales it
  to 1920×1080.
- **Tools.** `sharp` 0.35.4 crops and scales (already in the tree through
  Next, pinned as a root devDependency); raw frames stream into ffmpeg's stdin
  and out as H.264 (libx264, CRF 18, yuv420p). No per-frame files are written.
- **Captions after the camera.** A lower third in the tape style — a mono
  step chip and one line of text — composited after the crop, so zooming
  never scales it. Each caption, and the title card, is rendered by Chromium
  at the end of the take from a page of the running app, so it uses the
  site's own fonts and tokens, and saved as a PNG in the take. The site's
  fonts come from `next/font` and are not installed on the machine
  `[measured]`, so SVG rasterised by sharp would fall back to system fonts;
  the local ffmpeg has no `drawtext` filter `[measured]`.
- **Music.** Trimmed to the video, faded in over 1s and out over 2s, and
  normalised to −14 LUFS with `loudnorm`, AAC. Without `--music`, a silent AAC
  track, so every upload has the same shape.
- **Output.** `video/ledgerline-walkthrough.mp4` and
  `video/ledgerline-walkthrough-sheet.jpg`, a contact sheet of one frame per
  focus, for review without scrubbing. `video/` is gitignored.

## 6. Verification

- Unit tests for `cameraAt` (easing, holds, the zoom cap, clamping at every
  edge), for caption layout (a long line wraps, never overflows) and for the
  shared wallet's fee floor.
- `record-demo.ts` still records after the wallet moves: one testnet take of
  one layout and theme, compared with the note's figures.
- A full testnet rehearsal of the walkthrough, rendered, its contact sheet
  read, before any mainnet take.
- `ffprobe` on the output: 1920×1080, 30 fps, H.264, AAC, duration within
  2:10–2:40.
- The mainnet take checked on chain afterwards: status success, `from` the
  demo wallet, `to` `Multicall3From`, every non-system `Transfer.from` the
  payer. The figures go to `docs/notes/2026-09-29-walkthrough-video.md`,
  tagged `[measured]`, as the home demo's note does.

## 7. Out of scope

- A voice-over, and the maintainer's choice of music.
- `/why`, the CLI and an end card (dropped by the maintainer).
- Uploading to YouTube and editing the BUIDL page.
- Any change to the app to make it film better.

## 8. Risks

| Risk | Mitigation |
|---|---|
| 4K screencast is slow, so motion stutters | Measured in the rehearsal; fall back to device scale 1.5 |
| A mainnet take fails midway and costs a fee | Rehearse on testnet first; the balance check runs before the browser opens; a reverted run moves no money |
| Captions claim more than the frame shows | Each caption is written against its scene; the note records what was measured |
| The video drifts from the app after later UI changes | It is re-recorded by the same script; nothing is edited by hand |
