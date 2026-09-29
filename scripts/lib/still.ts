import type { Page } from "playwright";

/**
 * True in the page when nothing a viewer waits for is moving: no finite
 * animation or transition running (page-in, stagger, print-in, a button's
 * lift) and no count rolling (`data-counting`, motion polish §2.4). Infinite
 * ones — the feed line, a skeleton, the recorder's heartbeat — never end and
 * are not waited on. An expression, so waitForFunction can run it as it is.
 */
export const STILL =
  `document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity)`
  + ` && !document.querySelector("[data-counting]")`;

export async function waitForStill(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(STILL, undefined, { timeout });
}
