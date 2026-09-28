# The home page's demo video — Arc testnet

`scripts/record-demo.ts` drove the real app in Chromium on 2026-09-28: the
sample CSV uploaded, reviewed, checked against the chain, paid in one
transaction, and the first recipient's receipt opened until it read
**Verified**. Four recordings, each its own run:

- **wide**, 16:9 in the desktop layout — sidebar, the Review grid, the run
  summary beside each step — for the full-width tape on screens 1024px and up;
- **phone**, 4:5 in the phone layout, one card per line, for narrower
  screens, where a desktop layout scaled down would be unreadable;

each in the light and the dark theme, so the video matches the page around it.

Every figure below was read back off chain after recording, not copied from
the script's output. [measured]

## The runs

| | Transaction | Block | Gas used | `maxFeePerGas` | Mined (UTC) |
|---|---|---|---|---|---|
| wide, light | `0x56e067011c4208b0d80bb9b2fd1ad0cd0af5a8aea39bf342a15e24bf7c50a7f7` | 64,366,288 | 209,951 | 47.437499998 Gwei | 2026-09-28 02:12:44 |
| wide, dark | `0x91450f90912ee65b37ce31254cb97a7a5ee6315414b32f44de4aa9b0aa9e48a9` | 64,366,423 | 209,951 | 46.875 Gwei | 2026-09-28 02:13:53 |
| phone, light | `0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484` | 64,364,350 | 209,939 | 48.75 Gwei | 2026-09-28 01:56:15 |
| phone, dark | `0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990` | 64,364,452 | 209,951 | 46.875 Gwei | 2026-09-28 01:57:07 |

All four: status success, 11 logs; `from` is the payer's EOA
`0x595558B91DFAA97840F2F00bF6728A74B8E6de17`, `to` is `Multicall3From`
`0x522fAf9A91c41c443c66765030741e4AaCe147D0` — the anchor is a sibling
subcall, as invariant 2 requires. Each paid the sample file: 0.10 USDC,
0.10 EURC and 0.00001 cirBTC to `0xe48A…732a`.

A first phone take, `0xcdad25f9656d100f2ce403af8a4a3c34702020232ce08aca6ec6c8e7e3d3cbd2`
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

All in `frontend/public/demo/`. H.264, no audio. The poster is each video's
last frame, the verified receipt.

| File | Frame | Length | Size |
|---|---|---|---|
| `run-wide-light.mp4` | 1920×1080 (1280×720 CSS px at 1.5×) | 30.5 s | 1.3 MB |
| `run-wide-dark.mp4` | 1920×1080 | 30.8 s | 1.3 MB |
| `run-phone-light.mp4` | 840×1050 (420×525 CSS px at 2×) | 33.1 s | 1.0 MB |
| `run-phone-dark.mp4` | 840×1050 | 33.0 s | 1.0 MB |

The wide one plays at about 1160px on a desktop, so its text is at roughly
90% of its real size. Waits on the network play at 4× so the video shows the
chain answering without a spinner to watch.

## Re-recording

```
pnpm build
(cd frontend && pnpm exec next start -p 3100)
pnpm exec tsx scripts/record-demo.ts                        # all four: four testnet runs
pnpm exec tsx scripts/record-demo.ts --layout wide --theme dark
```

Then replace the hashes and blocks here and in `frontend/lib/demo-run.ts`;
`frontend/test/demo-run.test.ts` fails until the two agree.
