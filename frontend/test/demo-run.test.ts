import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_RUN as D, demoClip } from "@/lib/demo-run";

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const NOTE = readFileSync(path("../../docs/notes/2026-09-28-demo-video.md"), "utf8");

describe("the home page's demo is the runs the note measured", () => {
  for (const mode of ["light", "dark"] as const) {
    const clip = D.clips[mode];

    it(`${mode}: names the transaction and block the note names`, () => {
      expect(NOTE).toContain(clip.txHash);
      expect(NOTE).toContain(clip.block.toLocaleString("en-US"));
    });

    it(`${mode}: links the receipt of that same transaction, on testnet`, () => {
      expect(clip.receipt.startsWith(`/r/${clip.txHash}?`)).toBe(true);
      expect(new URLSearchParams(clip.receipt.split("?")[1]).get("n")).toBe("testnet");
    });

    it(`${mode}: points at a video and a poster that exist`, () => {
      expect(existsSync(path(`../public${clip.src}`))).toBe(true);
      expect(existsSync(path(`../public${clip.poster}`))).toBe(true);
    });
  }

  it("keeps the two themes' runs apart", () => {
    expect(D.clips.light.txHash).not.toBe(D.clips.dark.txHash);
  });

  it("is labelled with the network it was recorded on", () => {
    expect(D.network).toBe("testnet");
    expect(D.explorer).toBe("https://explorer.testnet.arc.io");
  });
});

describe("demoClip", () => {
  it("gives each theme its own recording", () => {
    expect(demoClip("light")).toBe(D.clips.light);
    expect(demoClip("dark")).toBe(D.clips.dark);
  });
});
