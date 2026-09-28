import type { Mode } from "@/lib/theme-tokens";

/**
 * The home page's demo video: one real run per layout and theme, recorded on
 * Arc testnet by scripts/record-demo.ts on 2026-09-28 and recorded in
 * docs/notes/2026-09-28-demo-video.md. test/demo-run.test.ts keeps this in
 * step with the note and with the files in public/demo.
 */
export interface DemoClip {
  src: string;
  /** The last frame: the verified receipt, for anyone who never presses play. */
  poster: string;
  width: number;
  height: number;
  txHash: `0x${string}`;
  block: number;
  /** The receipt the video ends on, on this site. */
  receipt: string;
}

/** wide: the desktop layout, 16:9. phone: the phone layout, 4:5, for screens
 *  where the desktop one scaled down would be unreadable. */
export type DemoLayout = "wide" | "phone";

/** Where the app itself switches to its desktop layout. */
export const WIDE_QUERY = "(min-width: 1024px)";

const WIDE = { width: 1920, height: 1080 };
const PHONE = { width: 840, height: 1050 };

export const DEMO_RUN = {
  network: "testnet",
  date: "2026-09-28",
  /** Spelled out rather than formatted: Node's ICU and a browser's disagree
   *  ("Sep" / "Sept"), and the page renders on both. */
  recorded: "28 Sep 2026",
  explorer: "https://explorer.testnet.arc.io",
  clips: {
    wide: {
      light: {
        ...WIDE,
        src: "/demo/run-wide-light.mp4",
        poster: "/demo/run-wide-light.jpg",
        txHash: "0x56e067011c4208b0d80bb9b2fd1ad0cd0af5a8aea39bf342a15e24bf7c50a7f7",
        block: 64_366_288,
        receipt:
          "/r/0x56e067011c4208b0d80bb9b2fd1ad0cd0af5a8aea39bf342a15e24bf7c50a7f7?i=INV-US-001" +
          "&s=0xd59190857dfbdf14a837ca8b1b79918fbb7cdbfdda605da3a2ab29ee0e3d7e5d" +
          "&p=u02XKki1yNt2gWg7DjZuaAIcf8mb_N0M2Y5D160bTPqMYatQVc8vmtsbNT877iINFz0J3NLVlyz0E4vjFlFQcQ&n=testnet",
      },
      dark: {
        ...WIDE,
        src: "/demo/run-wide-dark.mp4",
        poster: "/demo/run-wide-dark.jpg",
        txHash: "0x91450f90912ee65b37ce31254cb97a7a5ee6315414b32f44de4aa9b0aa9e48a9",
        block: 64_366_423,
        receipt:
          "/r/0x91450f90912ee65b37ce31254cb97a7a5ee6315414b32f44de4aa9b0aa9e48a9?i=INV-US-001" +
          "&s=0x085b668480a57292ca2f3c2665c4b88de6a520feb5a5f2747d29bf9e08389cd2" +
          "&p=CjvfepcBprsNy5XQPdRQRRNwlbsDQ82V_w97_X_fMoCyiauQItnGGMFbhOr2cXP0Lrix516xVJGASQFuVCP-7w&n=testnet",
      },
    },
    phone: {
      light: {
        ...PHONE,
        src: "/demo/run-phone-light.mp4",
        poster: "/demo/run-phone-light.jpg",
        txHash: "0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484",
        block: 64_364_350,
        receipt:
          "/r/0x64c231dcdbd173f8e1abc3ad808b4ab45759d008c9fa617ce24e0096b6a0d484?i=INV-US-001" +
          "&s=0x19b36a443226ff2e17e34d152231bba7f6c1df9351249d7338f819cd6432db1b" +
          "&p=Rk2NoHNbwgvUSeQApGgiOL8m8lTUFfJ75ghpPyx97JYmVB4WaFWHKRp7wAsFK7W37H5_sZOQJaCI8y9ZIq7H8A&n=testnet",
      },
      dark: {
        ...PHONE,
        src: "/demo/run-phone-dark.mp4",
        poster: "/demo/run-phone-dark.jpg",
        txHash: "0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990",
        block: 64_364_452,
        receipt:
          "/r/0x6d18b0386919df00811633c5a5614bddbf85ba345e19e0919bed5417190ab990?i=INV-US-001" +
          "&s=0xc0f113819ffa86870cc68db9a57cb68eda37453b21ecf93c25e048c6ac0b644a" +
          "&p=k9miYb6uQKdL8NISRGX0P23ROwQEcxrgoZZUgsSKPjiIp0VjkkFUo_F6M0oARgfiWqjgdURLBTscK6rEidbKzA&n=testnet",
      },
    },
  } satisfies Record<DemoLayout, Record<Mode, DemoClip>>,
} as const;

/** Each layout and theme plays its own recording, so the video matches the
 *  page around it and stays legible at the size it is shown. */
export function demoClip(layout: DemoLayout, mode: Mode): DemoClip {
  return DEMO_RUN.clips[layout][mode];
}
