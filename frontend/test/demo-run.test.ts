import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_RUN as D, DEMO_STEPS, WIDE_QUERY, chapterAt, demoClip } from "@/lib/demo-run";

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

describe("chapters", () => {
  for (const layout of LAYOUTS) for (const mode of MODES) {
    const clip = D.clips[layout][mode];
    const name = `${layout}, ${mode}`;

    it(`${name}: one start per step, from 0, increasing, inside the video`, () => {
      expect(clip.chapters).toHaveLength(DEMO_STEPS.length);
      expect(clip.chapters[0]).toBe(0);
      for (let i = 1; i < clip.chapters.length; i++) {
        expect(clip.chapters[i]!).toBeGreaterThan(clip.chapters[i - 1]!);
      }
      expect(clip.chapters.at(-1)!).toBeLessThan(clip.duration);
    });

    it(`${name}: the poster is a frame from the Check chapter`, () => {
      expect(clip.posterAt).toBeGreaterThanOrEqual(clip.chapters[2]!);
      expect(clip.posterAt).toBeLessThan(clip.chapters[3]!);
    });

    it(`${name}: the note carries the same starts, poster and length`, () => {
      const row = [name, ...clip.chapters.map((c) => c.toFixed(3)), clip.posterAt.toFixed(1), clip.duration.toFixed(3)];
      expect(NOTE).toContain(`| ${row.join(" | ")} |`);
    });
  }

  it("are labelled as the captions burned into the video", () => {
    expect(DEMO_STEPS).toEqual(["Upload", "Review", "Check", "Pay", "Receipt"]);
  });
});

describe("chapterAt", () => {
  const starts = [0, 4.2, 9.833, 16.367, 23.867];

  it("is the last chapter that has started", () => {
    expect(chapterAt(starts, 0)).toBe(0);
    expect(chapterAt(starts, 4.199)).toBe(0);
    expect(chapterAt(starts, 4.2)).toBe(1);
    expect(chapterAt(starts, 9.9)).toBe(2);
    expect(chapterAt(starts, 16.366)).toBe(2);
    expect(chapterAt(starts, 16.367)).toBe(3);
    expect(chapterAt(starts, 23.867)).toBe(4);
  });

  it("stays on the first before it and on the last after the end", () => {
    expect(chapterAt(starts, -1)).toBe(0);
    expect(chapterAt(starts, 999)).toBe(4);
  });
});
