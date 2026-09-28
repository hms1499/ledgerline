# The home page's demo video — Arc testnet

`scripts/record-demo.ts` drove the real app in Chromium on 2026-09-28: the
sample CSV uploaded, reviewed, checked against the chain, paid in one
transaction, and the first recipient's receipt opened until it read
**Verified**. Once in the light theme and once in the dark, so the video
matches the page it sits on. Each recording is its own run.

Every figure below was read back off chain after recording, not copied from
the script's output. [measured]

## The runs

| | Light | Dark |
|---|---|---|
| Transaction | `0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484` | `0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990` |
| Block | 64,364,350 | 64,364,452 |
| Status | success | success |
| Gas used | 209,939 | 209,951 |
| Logs | 11 | 11 |
| `maxFeePerGas` | 48.75 Gwei | 46.875 Gwei |
| Mined | 2026-09-28 01:56:15 UTC | 2026-09-28 01:57:07 UTC |

Both: `from` is the payer's EOA `0x595558B91DFAA97840F2F00bF6728A74B8E6de17`,
`to` is `Multicall3From` `0x522fAf9A91c41c443c66765030741e4AaCe147D0` — the
anchor is a sibling subcall, as invariant 2 requires. Each paid the sample
file: 0.10 USDC, 0.10 EURC and 0.00001 cirBTC to `0xe48A…732a`.

A first light take, `0xcdad25f9656d100f2ce403af8a4a3c34702020232ce08aca6ec6c8e7e3d3cbd2`
(block 64,364,090, success), was re-recorded for pacing and is not shown.

## The wallet in the recording

A stand-in announced over EIP-6963 as "Demo wallet". It draws no wallet UI of
its own, so nothing in the video imitates MetaMask or Rabby. Every request
crossed to Node, where the demo key signed exactly what the app asked for:
the fee came from `execute.ts` untouched, and the script refuses anything under
25 Gwei rather than send a transaction Arc would drop without a word.

What the stand-in does not show: a real wallet's confirmation prompts. The
signature on the Check step and the payment on the Pay step are both real;
the prompts a payer would click through are not in the video.

## Files

| File | Size | |
|---|---|---|
| `frontend/public/demo/run-light.mp4` | 1.0 MB | 840×1050, H.264, 33.1 s |
| `frontend/public/demo/run-dark.mp4` | 1.0 MB | 840×1050, H.264, 33.0 s |
| `run-light.jpg`, `run-dark.jpg` | ~85 KB | Last frame, the verified receipt; the poster |

420×525 CSS pixels at 2×: 4:5 fits the home page's right-hand column, and
under 640px the app is in its phone layout, which stays legible at that size.
Waits on the network play at 4× so the video shows the chain answering
without a spinner to watch.

## Re-recording

```
pnpm build
(cd frontend && pnpm exec next start -p 3100)
pnpm exec tsx scripts/record-demo.ts            # both themes, two testnet runs
```

Then replace the hashes and blocks here and in `frontend/lib/demo-run.ts`;
`frontend/test/demo-run.test.ts` fails until the two agree.
