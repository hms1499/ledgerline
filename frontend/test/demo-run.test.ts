import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_RUN as D, WIDE_QUERY, demoClip } from "@/lib/demo-run";

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const NOTE = readFileSync(path("../../docs/notes/2026-09-28-demo-video.md"), "utf8");
const SHELL_CSS = readFileSync(path("../app/styles/shell.css"), "utf8");

/** A baseline JPEG's size, from its SOF0 marker. */
function jpegSize(file: string): [number, number] {
  const b = readFileSync(file);
  for (let i = 2; i < b.length - 8; ) {
    if (b[i] !== 0xff) throw new Error(`not a JPEG marker at ${i}`);
    if (b[i + 1] === 0xc0) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("no SOF0 marker");
}

const LAYOUTS = ["wide", "phone"] as const;
const MODES = ["light", "dark"] as const;

describe("the home page's demo is the runs the note measured", () => {
  for (const layout of LAYOUTS) for (const mode of MODES) {
    const clip = D.clips[layout][mode];
    const name = `${layout}, ${mode}`;

    it(`${name}: names the transaction and block the note names`, () => {
      expect(NOTE).toMatch(new RegExp(`\\| ${name} \\| \`${clip.txHash}\` \\| ${clip.block.toLocaleString("en-US")} \\|`));
    });

    it(`${name}: links the receipt of that same transaction, on testnet`, () => {
      expect(clip.receipt.startsWith(`/r/${clip.txHash}?`)).toBe(true);
      expect(new URLSearchParams(clip.receipt.split("?")[1]).get("n")).toBe("testnet");
    });

    it(`${name}: points at a video and a poster that exist, at the size the page reserves`, () => {
      expect(clip.src).toBe(`/demo/run-${layout}-${mode}.mp4`);
      expect(existsSync(path(`../public${clip.src}`))).toBe(true);
      expect(jpegSize(path(`../public${clip.poster}`))).toEqual([clip.width, clip.height]);
    });
  }

  it("keeps every recording's run apart", () => {
    const hashes = LAYOUTS.flatMap((l) => MODES.map((m) => D.clips[l][m].txHash));
    expect(new Set(hashes).size).toBe(4);
  });

  it("is 16:9 wide and 4:5 on a phone", () => {
    for (const m of MODES) {
      expect(D.clips.wide[m].width / D.clips.wide[m].height).toBeCloseTo(16 / 9);
      expect(D.clips.phone[m].width / D.clips.phone[m].height).toBeCloseTo(4 / 5);
    }
  });

  it("switches to the wide recording where the app switches to its desktop layout", () => {
    expect(WIDE_QUERY).toBe("(min-width: 1024px)");
    expect(SHELL_CSS).toContain(`@media ${WIDE_QUERY}`);
  });

  it("prints the date it was recorded, the way a receipt prints one", () => {
    expect(D.recorded).toBe("28 Sep 2026");
    expect(D.date).toBe("2026-09-28");
    expect(NOTE).toContain(D.date);
  });

  it("is labelled with the network it was recorded on", () => {
    expect(D.network).toBe("testnet");
    expect(D.explorer).toBe("https://explorer.testnet.arc.io");
  });
});

describe("demoClip", () => {
  it("gives each layout and theme its own recording", () => {
    for (const l of LAYOUTS) for (const m of MODES) expect(demoClip(l, m)).toBe(D.clips[l][m]);
  });
});
