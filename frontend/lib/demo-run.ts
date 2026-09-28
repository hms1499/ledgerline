import type { Mode } from "@/lib/theme-tokens";

/**
 * The home page's demo video: one real run per theme, recorded on Arc testnet
 * by scripts/record-demo.ts on 2026-09-28 and recorded in
 * docs/notes/2026-09-28-demo-video.md. test/demo-run.test.ts keeps this in
 * step with the note and with the files in public/demo.
 */
export interface DemoClip {
  src: string;
  /** The last frame: the verified receipt, for anyone who never presses play. */
  poster: string;
  txHash: `0x${string}`;
  block: number;
  /** The receipt the video ends on, on this site. */
  receipt: string;
}

export const DEMO_RUN = {
  network: "testnet",
  date: "2026-09-28",
  /** Spelled out rather than formatted: Node's ICU and a browser's disagree
   *  ("Sep" / "Sept"), and the page renders on both. */
  recorded: "28 Sep 2026",
  explorer: "https://explorer.testnet.arc.io",
  /** 420×525 CSS pixels at 2×. */
  width: 840,
  height: 1050,
  clips: {
    light: {
      src: "/demo/run-light.mp4",
      poster: "/demo/run-light.jpg",
      txHash: "0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484",
      block: 64_364_350,
      receipt:
        "/r/0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484?i=INV-US-001" +
        "&s=0x19b36a443226ff2e17e34d152231bba7f6c1df9351249d7338f819cd6432db1b" +
        "&p=Rk2NoHNbwgvUSeQApGgiOL8m8lTUFfJ75ghpPyx97JYmVB4WaFWHKRp7wAsFK7W37H5_sZOQJaCI8y9ZIq7H8A&n=testnet",
    },
    dark: {
      src: "/demo/run-dark.mp4",
      poster: "/demo/run-dark.jpg",
      txHash: "0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990",
      block: 64_364_452,
      receipt:
        "/r/0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990?i=INV-US-001" +
        "&s=0xc0f113819ffa86870cc68db9a57cb68eda37453b21ecf93c25e048c6ac0b644a" +
        "&p=k9miYb6uQKdL8NISRGX0P23ROwQEcxrgoZZUgsSKPjiIp0VjkkFUo_F6M0oARgfiWqjgdURLBTscK6rEidbKzA&n=testnet",
    },
  } satisfies Record<Mode, DemoClip>,
} as const;

/** Each theme plays its own recording, so the video matches the page around it. */
export function demoClip(mode: Mode): DemoClip {
  return DEMO_RUN.clips[mode];
}
