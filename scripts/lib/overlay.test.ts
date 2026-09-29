import { describe, it, expect } from "vitest";
import { captionHtml, centre, dateText, escapeHtml, POINTER_SETUP, titleHtml } from "./overlay.js";

describe("captionHtml", () => {
  it("escapes what it is given", () => {
    expect(captionHtml("1 · Upload", "a <b> & c")).toContain("a &lt;b&gt; &amp; c");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("refuses a caption too long for one line", () => {
    expect(() => captionHtml("x", "y".repeat(81))).toThrow(/80/);
  });
});

describe("titleHtml", () => {
  it("title names the take's network and its day, spelled out", () => {
    expect(titleHtml("testnet", "2026-09-29")).toContain("Recorded on Arc testnet · 29 Sep 2026");
    expect(titleHtml("mainnet", "2026-10-05")).toContain("Recorded on Arc mainnet · 5 Oct 2026");
  });
});

describe("dateText", () => {
  it("does not depend on the runtime's locale data", () => {
    expect(dateText("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("the pointer", () => {
  it("is valid page script that names no wallet", () => {
    expect(() => new Function(POINTER_SETUP)).not.toThrow();
    expect(POINTER_SETUP).not.toMatch(/metamask|rabby|coinbase|phantom/i);
  });

  it("keeps a still page sending frames, so its last change is never lost", () => {
    // The screencast drops frames drawn while it waits for an ack; a page that
    // then stays still never sends its final state. A 1px heartbeat redraws
    // five times a second.
    expect(POINTER_SETUP).toMatch(/vid-heartbeat/);
    expect(POINTER_SETUP).toMatch(/steps\(1\)/);
  });

  it("aims at the middle of a box", () => {
    expect(centre({ x: 10, y: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 });
  });
});
