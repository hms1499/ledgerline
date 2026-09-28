# Home polish — layout fixes, a footer that ends the page, two honest motions

A pass over the home page as it stands after the demo video landed: remove what
repeats, fix what a screen reader or a phone gets wrong, give the page a real
end, and add the only two motions that mean something.

**Parent specs:** `2026-09-24-tape-design-system-design.md` (tokens, the tape,
§5 horizontal layout, §7.1 Home, §7.4 Site footer, §8 Motion). This spec
amends §7.1, §7.4 and §8 of it; everything else there stands. Nothing here
changes core, the payout sequence, the demo recordings' runs, or any invariant
in `CLAUDE.md`.

Claims are tagged `[measured]`, `[docs]`, `[unverified]`, as in the parents.

---

## 1. Why

Measured on `next start`, 2026-09-28, light theme, reduced motion, at 390,
1024, 1440 and 1920px `[measured]`:

| Section | top / height at 1440 | height at 390 |
|---|---|---|
| Hero (8 + 4) | 105 / 391 | 434 + 286 |
| Watch a run | 520 / 808 | 617 |
| How a run works | 1352 / 270 | 585 |
| Proof · Arc mainnet | 1646 / 620 | 1060 |
| Site footer | 2290 / 274 | 416 |

What is wrong with it:

1. **The same receipt twice.** The hero's example tape and the demo's poster
   are both "Payment advice · INV-US-001 · 0.10 USDC · Verified", about 400px
   apart at 1440 and back to back on a phone. The poster was chosen as the
   video's last frame when the video *replaced* the example; the example is
   back, so the poster now repeats it.
2. **The comparison table is cramped on a phone.** At 390px its three columns
   wrap "2 — an approval, then the batch" onto three lines; the Proof tape is
   1060px tall.
3. **The heading outline skips a level.** axe reports `heading-order` on
   `<h3>Upload a list of invoices</h3>`: every tape head on the page is a
   `<strong>`, so the outline goes h1 → h3.
4. **The footer does not end the page.** The header is chrome — a full-width
   ground and rule, its content in the frame — while the footer is one more
   tape inside the 1200px frame (§7.4 as written). It reads as another card.
   It is also rendered inside `<main>` (`page.tsx`, `Why.tsx`), so it is not a
   `contentinfo` landmark.
5. **Testnet beside mainnet, unexplained.** The video is labelled Arc testnet
   and the Proof tape Arc mainnet, with nothing saying why both are there.

## 2. Decisions made

| Question | Decision |
|---|---|
| Section order | Unchanged: Hero → Watch a run → How a run works → Proof → footer |
| Merge "How a run works" into the video | No |
| The poster | A frame from the Check chapter, not the receipt |
| The footer | A full-width band like the header, outside `<main>`, on `/` and `/why` |
| Motion | Chapters that follow the video; the example receipt prints in once |
| Re-record the videos | No — chapter times are measured from the existing files |

## 3. Layout

### 3.1 Poster

Each of the four recordings gets a poster from its **Check** chapter: the
moment "Every payment would go through" shows with its four ✓ lines (and, in
the wide recording, the run summary beside it). The hero already shows what a
recipient sees; the video opens on what the payer sees.

- Extracted from the existing mp4 with ffmpeg at a timestamp chosen by eye;
  the timestamp is recorded in `lib/demo-run.ts` and the demo note.
- Same file names and sizes (1920×1080, 840×1050), so `test/demo-run.test.ts`
  keeps checking them unchanged.
- The comments in `lib/demo-run.ts` and `DemoVideo.tsx` that call the poster
  "the last frame: the verified receipt" change with it.
- `scripts/record-demo.ts` takes the poster from the frame the Check step
  shows "Every payment would go through", so a re-recording agrees.

### 3.2 The comparison on a phone

At 640px and up, the table as today. Below 640px, a list rendered from the same
`controlComparison()` rows:

```
PAYMENTS CARRYING THEIR INVOICE
  Ledgerline       3 of 3
  Standard batch   0 of 1
```

— a `<dl>`, the claim as `<dt>`, each side as a `<dd>` with its label. The "No
difference here." note stays on its row. The two forms are switched by a media
query in `pages.css`, not by the `only-sm` utility: that one sets
`display: inline-flex`, which is wrong for a list.

### 3.3 Headings

The heads of **Watch a run**, **How a run works** and **Proof · Arc mainnet**
become `<h2 className="tape-head-title">`, styled exactly as `.tape-head
strong` is today, so nothing moves. The steps' `<h3>` and "The same payment,
the ordinary way" then sit under an h2. The hero's example tape keeps its
`<strong>`: it is an illustration, not a section. axe must report no
violations on `/` in either theme.

### 3.4 Testnet beside mainnet

The demo's description gains one sentence: *"Recorded on Arc testnet. The same
flow, measured on mainnet, is under Proof below."* It passes
`test/plain-language.test.ts` like the rest of the public copy.

### 3.5 The footer (amends §7.4)

The footer becomes the page's end, mirroring the header:

- **Band:** full width, `deskDeep` ground, `1px solid rule` along its top
  (the header has the same rule along its bottom). Its content sits in the
  same `.frame`, so its left edge is the logo's. Padding 40px top, 48px bottom
  (≥ 640); 32 / 40 below. No tape, no scalloped edge.
- **Contents unchanged:** the head row (`✱ LEDGERLINE` / `Arc <network> ·
  chain <id>`) over a 1.5px dashed ink rule; "Check it without us" with the
  copyable command and "Read more", 2 : 1 split by a dotted rule; the end line
  (recorded-lists address, "Never holds funds · no admin · no upgrades"); `✱ ✱ ✱`.
- **Contrast:** every text colour it uses is already measured on `deskDeep`
  (§4.1 of the parent): ink 12.10 / 17.41, inkSoft 5.07 / 8.65 (light / dark).
  The command box keeps its `tapeShade` ground.
- **Where it renders:** `PublicShell`, after `</main>`, as `<footer>` — a
  `contentinfo` landmark. It shows on `/` and `/why` only, decided by a pure
  `showsSiteFooter(pathname)` in `lib/site-footer.ts`; `/r` keeps no footer,
  as §7.4 says. `page.tsx` and `Why.tsx` stop rendering it.
- **Network:** the shell reads it from `?n=` as the `NetworkBadge` beside the
  logo already does, so the footer and the badge always name the same network.
  Without `?n=` that is the default network, as today.

## 4. Motion (amends §8)

Two additions. Everything else in §8 stands — no hover lifts, no page
transitions, no scroll reveals — and one rule is added: **no count-ups**. A
measured figure is printed, not rolled.

Both are static under `prefers-reduced-motion: reduce`, as §8 already requires.

### 4.1 Chapters that follow the video

**Data.** Each recording has five chapter starts, one per app step, labelled
exactly as its burned-in captions: `Upload`, `Review`, `Check`, `Pay`,
`Receipt`. Measured by scene detection on the caption strip of each mp4 (bottom
108px wide, 132px phone; ffmpeg `select='gt(scene,0.02)'`) `[measured]`:

| Recording | Upload | Review | Check | Pay | Receipt | Length |
|---|---|---|---|---|---|---|
| wide, light | 0 | 4.200 | 9.833 | 16.367 | 23.867 | 30.47 |
| wide, dark | 0 | 4.233 | 9.967 | 16.433 | 24.233 | 30.77 |
| phone, light | 0 | 4.267 | 12.167 | 18.833 | 26.667 | 33.07 |
| phone, dark | 0 | 4.267 | 12.033 | 18.667 | 26.567 | 33.00 |

A sixth change in each (~20s wide, ~23s phone) is the caption going from
"4 · Pay" to "4 · Paid" inside the Pay chapter, and is not a chapter. Each start
is confirmed by extracting the frame just after it before it is committed.

- Stored per clip in `lib/demo-run.ts` (`chapters: number[]`), with the labels
  once as `DEMO_STEPS`. Also written into the demo note, and
  `test/demo-run.test.ts` checks the two agree, as it does for the hashes.
- Tests: five starts per clip, the first 0, strictly increasing, the last
  under the clip's length.
- `scripts/record-demo.ts` prints each chapter's start on the output timeline
  (after the 4× waits are compressed), so a re-recording needs no detection.

**Which chapter is showing:** a pure `chapterAt(starts, t)` — the last start at
or before `t` — tested at, just before and just after each boundary.

**The rail.** Under the video, an `<ol aria-label="Chapters">` of five
buttons, `1 Upload` … `5 Receipt`, in mono like the app's step bar.

- The chapter showing gets the **highlighter** (`highlight` ground,
  `onHighlight` text — "look at this", §3.3 of the parent) and
  `aria-current="step"`.
- Pressing one seeks to its start and plays: that is the viewer choosing Play,
  so it counts as `chosen = "play"` and overrides reduced motion, as the Play
  button already does.
- The rail follows the recording, not the viewport: with the wide recording
  (≥ 1024px) it is one row; with the phone recording (below 1024px, in its
  420px column) it is a five-column grid, number over label, at the bottom
  tabs' size (10.5px). Every button is at least 24×24px (WCAG 2.5.8).

**The feed line.** A 1.5px dashed ink line under the video whose drawn length is
`currentTime / duration` — the tape feeding out of the machine, which is what
the dashed feed line already means (§6.1 of the parent).

- Drawn with `transform: scaleX(p)`, `transform-origin: left`: no layout, no
  shift.
- Updated in a `requestAnimationFrame` loop only while the video plays and is
  in view, writing the style directly — no React render per frame. The active
  chapter is React state and changes only when the chapter does.
- `aria-hidden`: the rail's `aria-current` already says where the video is.
- Under reduced motion the line is not drawn; the rail still follows a video
  the viewer chose to play, because a chapter changing is a state, not motion.

### 4.2 The example receipt prints in

Once, on load, CSS only, on the hero's example tape:

- The Invoice line, the To line, the amount, the dashed rule and the "Five
  checks" line each run the existing `print-in` keyframes (fade in, 4px upward
  feed, 260ms), 70ms apart — the same rhythm as the checks on `/r`.
- Then the **Verified** stamp lands: `stamp-in`, from `opacity: 0;
  transform: scale(1.06)` to rest, 120ms ease-out.
- All of it is over within 700ms. It never loops and is not triggered by
  scrolling.
- `animation-fill-mode: backwards`: a line is hidden only while it waits for
  its turn, so a browser that skips the animation shows the tape complete.
- It is printing, not checking: the tape is labelled Example, and nothing in
  the animation claims a check is running.

## 5. Testing and definition of done

**Unit (vitest, in `pnpm test`):**

- `chapterAt` at, before and after every boundary, and past the end.
- Chapter data: five per clip, first 0, strictly increasing, under the length;
  the note carries the same starts.
- `showsSiteFooter`: true for `/` and `/why`, false for `/r/<tx>`, `/new`,
  `/dashboard`.
- Poster sizes unchanged (existing test).
- The bridge sentence passes `plain-language.test.ts`.

**Browser (Playwright against `next start`, fresh context per case):**

- 1440, 1024 and 390px, light and dark: axe reports no violations on `/`;
  no console errors; no horizontal scroll.
- Posters: the Check frame, in each layout and theme.
- Footer: a `contentinfo` landmark on `/` and `/why`, none on `/r/<tx>`; its
  band as wide as the viewport; its content's left edge equal to the logo's.
- Comparison: the list below 640px, the table from 640px up, never both.
- Chapters: the highlighted chapter follows playback across every boundary;
  pressing a chapter seeks to within 0.1s of its start and plays.
- Feed line: its scale grows while playing and holds while paused; absent
  under reduced motion.
- Print-in: running on first paint without reduced motion
  (`getAnimations()` on the example's lines), none with it; the tape complete
  once it ends.
- Layout shift: a `PerformanceObserver` for `layout-shift` reports 0 from load
  through one full play of the video.

**Done means** all of the above pass, the parent spec's §7.1, §7.4 and §8 carry a
one-line pointer to this spec, and the work is committed in logical commits.

## 6. Order of work

1. `showsSiteFooter`; the footer as a band in `PublicShell`; removed from the
   two pages.
2. Tape heads as h2.
3. The comparison list below 640px.
4. The bridge sentence.
5. Chapter data in `demo-run.ts` and the note, frames checked; the script
   prints chapters and takes the Check poster.
6. New posters.
7. `chapterAt`; the rail and the feed line in `DemoVideo`.
8. Print-in on the example tape.
9. Pointers in the parent spec.
10. Browser verification.

## 7. Risks

- **Chapter starts drift from the files.** They are measured, not derived at
  runtime. A re-recording changes them; the script prints the new ones and the
  test fails until `demo-run.ts` and the note agree.
- **A seek lands on the previous chapter's last frame.** Seeking exactly to a
  start can show the frame before it. Seek to start + 0.05s.
- **The feed loop outlives the video.** The loop stops on pause, on leaving the
  viewport, and on unmount; the test checks no frame callback is pending after
  pause `[unverified]` until measured.
- **Footer network differs from the home page's.** The home page's content
  uses the default network and ignores `?n=`; the footer follows `?n=` like the
  badge. On `/?n=testnet` the footer says testnet while the proof says mainnet —
  which is correct, since the proof is labelled mainnet on every network (§7.1).

## 8. Out of scope

- Merging "How a run works" into the video, or moving Proof.
- Re-recording any video.
- Count-ups, scroll reveals, parallax, hover lifts, page transitions.
- A closing call to action above the footer.
- The footer on `/r` or on app pages.
