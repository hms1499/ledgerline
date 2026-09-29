import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";

export interface Frame { file: string; at: number }

/** CDP screencast, not Playwright's recordVideo: that one encodes realtime
 *  VP8 at 1 Mbit/s, which smears 13px table figures. These are the page's own
 *  device pixels, timed by the browser, encoded once at the end. */
export async function startCapture(
  page: Page, dir: string, shape: { width: number; height: number; scale: number }, quality = 95,
) {
  const frames: Frame[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, at: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg", quality,
    maxWidth: shape.width * shape.scale, maxHeight: shape.height * shape.scale, everyNthFrame: 1,
  });
  return { frames, stop: () => cdp.send("Page.stopScreencast") };
}
