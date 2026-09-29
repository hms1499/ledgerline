import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";

export interface Frame { file: string; at: number }

/**
 * When a frame was on screen. Chrome sends the next screencast frame only
 * after the last one is acknowledged, so arrival order is display order;
 * the timestamp only says when. A stamp that is missing (the arrival time
 * stands in, and is always late) or earlier than the last frame's would put
 * frames out of order, so the time is held at the last frame's instead, and
 * `adjusted` says so.
 */
export function frameTime(prev: number | undefined, stamp: number | undefined, arrival: number) {
  const raw = stamp ?? arrival;
  if (prev === undefined) return { at: raw, adjusted: stamp === undefined };
  return { at: Math.max(prev, raw), adjusted: stamp === undefined || stamp < prev };
}

/** CDP screencast, not Playwright's recordVideo: that one encodes realtime
 *  VP8 at 1 Mbit/s, which smears 13px table figures. These are the page's own
 *  device pixels, timed by the browser, encoded once at the end. */
export async function startCapture(
  page: Page, dir: string, shape: { width: number; height: number; scale: number }, quality = 95,
) {
  const frames: Frame[] = [];
  /** Frames whose time was held or stood in for; see frameTime. */
  const adjusted: { index: number; stamp: number | undefined; prev: number | undefined }[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    const prev = frames.at(-1)?.at;
    const t = frameTime(prev, metadata.timestamp, Date.now() / 1000);
    if (t.adjusted) adjusted.push({ index: frames.length, stamp: metadata.timestamp, prev });
    frames.push({ file, at: t.at });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg", quality,
    maxWidth: shape.width * shape.scale, maxHeight: shape.height * shape.scale, everyNthFrame: 1,
  });
  return { frames, adjusted, stop: () => cdp.send("Page.stopScreencast") };
}
