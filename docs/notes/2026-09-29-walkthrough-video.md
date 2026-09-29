# The submission walkthrough — Arc mainnet

`scripts/record-walkthrough.ts` drove the real app in Chromium on 2026-09-29
and paid one run on Arc mainnet: a CSV with two mistakes (a token written
`USD`, and an EURC line larger than the wallet holds) uploaded, fixed in
place, checked against the chain, paid in one transaction, the first
recipient's receipt opened until it read **Verified**, the run reconciled
with and without the payer's run file, and the dashboard. Spec:
`docs/superpowers/specs/2026-09-29-walkthrough-video-design.md`.

Every figure below was read back off chain or measured on the file after
recording, not copied from the script's output. [measured]

## The run

| | |
|---|---|
| Run name | `video-2026-09-29-0710` |
| Transaction | `0x79720a20c9ee448efb52903deadabcf4fd6eb70263efbcdf0db0ed0d06839cbb` |
| Block | 23,331,255, mined 2026-09-29 07:11:52 UTC |
| Status | success, 15 logs |
| Gas used | 232,297 |
| `maxFeePerGas` | 30 Gwei (priority 1 Gwei); effective price 21 Gwei |
| Fee | 0.004878237 USDC |

`from` is the payer's EOA `0x595558B91DFAA97840F2F00bF6728A74B8E6de17`, `to`
is `Multicall3From` `0x522fAf9A91c41c443c66765030741e4AaCe147D0`. Every
`Transfer` not from the system emitter has the payer as `from`:

| Token | Invoice | Paid to `0xe48A096B9E74f064b13c17734af29F85E02d732a` |
|---|---|---|
| USDC | INV-V-001 | 0.01 (10000 raw) |
| USDC | INV-V-002 (was `USD` in the file) | 0.01 (10000 raw) |
| EURC | INV-V-003 (was 1000 in the file) | 0.01 (10000 raw) |
| cirBTC | INV-V-004 | 0.0000001 (10 raw) |

The 15 logs: those four, the two EIP-7708 copies of the USDC transfers from
`0xffff…fFfE`, four `BeforeMemo` and four `Memo` from `Memo`, and one from
`PayoutAnchor` `0xd4838881EcBa8320d456B8B65A07A0ac167F0890` — the anchor is a
sibling subcall, as invariant 2 requires.

## The wallet

| | USDC | EURC | cirBTC |
|---|---|---|---|
| Before the take | 2.651207 | 0.10807 | 0.00000084 |
| After the take | 2.626329 | 0.09807 | 0.00000074 |

USDC fell by 0.024878: the two 0.01 lines plus the fee, to the sixth decimal
`balanceOf` reports.

## The take

2804 frames at 3840×2160 (1920×1080 CSS px at 2×) over 135.9 s, 20.6 frames a
second. Chromium was launched with `--force-device-scale-factor=2`: without it
the CDP screencast sends 1920×1080 frames whatever the context's
`deviceScaleFactor`, and every zoom would upscale.

## The video

| File | Frame | Length | Size | Audio |
|---|---|---|---|---|
| `video/ledgerline-walkthrough.mp4` | 1920×1080, 30 fps, H.264 CRF 18 yuv420p | 132.4 s (3972 frames, a 4 s title card first) | 24.0 MB | AAC, silent: −70.0 LUFS integrated |
| `video/ledgerline-walkthrough-sheet.jpg` | 29 tiles, one per focus, 1 s after each move starts | | | |

Rendered without music. `--music <file>` re-renders from the same take, the
track looped to length, faded in 1 s and out 2 s, and normalised to −14 LUFS.

The camera frames what each caption talks about, eases over 0.7 s, and never
zooms past 2×, so no frame is upscaled. A caption sits at the bottom unless the
element in focus would sit under it; then it moves to the top. Three focuses
do: the file as a table, the Safe treasury block, and every token covered. Waits on the network play at 4×. The
title card reads "Recorded on Arc mainnet · 29 Sep 2026".

`video/` is gitignored: the mp4, its contact sheet and the take stay on the
machine that recorded them. Uploading the video is the maintainer's step.

## Rehearsals on Arc testnet

Each rehearsal was a real run on testnet with the same script. The two kept:

| Take | Transaction | Block | Frames |
|---|---|---|---|
| `video-2026-09-29-0436` | `0x22769138997b629d1d6d31759afdfcb9bdeefc617d3b2b047c5a12555b869300` | 64,552,800 | 2216 over 144.8 s |
| `video-2026-09-29-0706` | `0x82c89f68f20c4c4afcb8255b942cade65b7d4925a1563572663a3621470ea242` | 64,570,398 | 3562 over 139.1 s |

One testnet take before `0706` stopped at Pay with "This page could not
confirm the wallet holds enough"; nothing was signed and the wallet's nonce
did not move. The same script passed a minute later, unchanged. The likely
cause is a balance read the public testnet RPC did not answer; the page's
technical details were not captured. [unverified]

## What the video does not show

A real wallet's prompts. The wallet in the recording is a stand-in announced
over EIP-6963 as "Demo wallet"; it draws no wallet UI, so nothing imitates
MetaMask or Rabby. Every request crossed to Node, where the demo key signed
what the app asked for and refused any fee under 25 Gwei or any other sender.
The signature on Check and the payment on Pay are real; the prompts a payer
would click through are not in the video.

## Re-recording

```
pnpm build
(cd frontend && pnpm exec next start -p 3100)
pnpm exec tsx scripts/record-walkthrough.ts --network testnet                     # rehearse
pnpm exec tsx scripts/record-walkthrough.ts --network mainnet --confirm-mainnet   # pays real money
pnpm exec tsx scripts/render-walkthrough.ts video/takes/<run name> [--music <file>]
```

A render needs only the take, so music or a new crop never needs a new run.
