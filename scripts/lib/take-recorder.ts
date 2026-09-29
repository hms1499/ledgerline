/**
 * The Playwright side of a take: it logs what the camera should look at and
 * what the captions say, moves the pointer before each real click, and at the
 * end renders the captions and title card in the site's own fonts.
 */
import type { Browser, Locator, Page } from "playwright";
import { join } from "node:path";
import type { Rect } from "./camera.js";
import { centre, captionHtml, OVERLAY_CSS, titleHtml } from "./overlay.js";
import { unionRect, visibleRect, type TakeEvents } from "./take.js";
import { CAPTIONS, type CaptionKey } from "./walkthrough.js";

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

type PointerWindow = {
  __pointerTo(x: number, y: number): void;
  __pointerPlace(x: number, y: number): void;
  __pointerRipple(x: number, y: number): void;
};

export class TakeRecorder {
  private pointer = { x: -100, y: -100 };
  constructor(private page: Page, readonly events: TakeEvents) {}

  /** Waits for smooth scrolling to stop, so the box logged is the box shown. */
  private async settle() {
    let last = await this.page.evaluate(() => window.scrollY);
    for (let i = 0; i < 20; i++) {
      await pause(100);
      const y = await this.page.evaluate(() => window.scrollY);
      if (y === last) return;
      last = y;
    }
  }

  async focus(target: Locator | Locator[], label: string, zoom?: number) {
    await this.settle();
    const view = { width: this.events.view.width, height: this.events.view.height };
    const boxes: Rect[] = [];
    for (const t of Array.isArray(target) ? target : [target]) {
      const all = await t.all();
      if (all.length === 0) throw new Error(`cannot focus ${label}: nothing on the page matches`);
      for (const el of all) boxes.push(visibleRect(await el.boundingBox(), view, label));
    }
    this.events.focuses.push({ at: now(), rect: unionRect(boxes), zoom, label });
  }

  /** Waits until nothing on the page is still loading — no antd skeleton or
   *  spinner — for `quiet` ms in a row. A focus on a page still reading the
   *  chain frames grey boxes, and the rehearsal showed a run page could go
   *  back to loading after its first answer. The wait is played faster. */
  async loaded(quiet = 800, timeout = 60_000) {
    await this.waiting((async () => {
      const until = Date.now() + timeout;
      let calmSince = 0;
      while (Date.now() < until) {
        const busy = await this.page.locator(".ant-skeleton, .ant-spin-spinning").count();
        if (busy > 0) calmSince = 0;
        else if (!calmSince) calmSince = Date.now();
        else if (Date.now() - calmSince >= quiet) return;
        await pause(100);
      }
      throw new Error(`the page was still loading after ${timeout / 1000} s`);
    })());
  }

  wide() {
    this.events.focuses.push({ at: now(), rect: null, label: "wide" });
  }

  caption(key: CaptionKey) {
    const [step, text] = CAPTIONS[key];
    this.events.captions.push({ at: now(), step, text });
  }

  async waiting<T>(work: Promise<T>): Promise<T> {
    const from = now();
    try { return await work; } finally { this.events.waits.push({ from, to: now() }); }
  }

  /** After a navigation the pointer is new; put it back where it was. */
  async placePointer() {
    await this.page.evaluate(([x, y]) => (window as unknown as PointerWindow).__pointerPlace(x!, y!),
      [this.pointer.x, this.pointer.y]);
  }

  async click(target: Locator, opts: { double?: boolean } = {}) {
    const el = target.first();
    await el.scrollIntoViewIfNeeded();
    await this.settle();
    const box = await el.boundingBox();
    if (!box) throw new Error("cannot click an element with no box");
    const { x, y } = centre(box);
    await this.page.evaluate(([a, b]) => (window as unknown as PointerWindow).__pointerTo(a!, b!), [x, y]);
    this.pointer = { x, y };
    await pause(650);
    await this.page.evaluate(([a, b]) => (window as unknown as PointerWindow).__pointerRipple(a!, b!), [x, y]);
    if (opts.double) await el.dblclick(); else await el.click();
  }
}

/** Captions and the title card, rendered from a page of the running app so
 *  they use its fonts and tokens. Written into the take and named in it. */
export async function renderOverlays(browser: Browser, base: string, take: TakeEvents, dir: string) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "light" });
  await context.addCookies([{ name: "theme", value: "light", domain: new URL(base).hostname, path: "/" }]);
  const page = await context.newPage();
  await page.goto(`${base}/?n=${take.network}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const stage = document.createElement("div");
    stage.id = "vid-stage";
    document.body.append(stage);
  }, OVERLAY_CSS);
  const stage = page.locator("#vid-stage");

  for (const [n, c] of take.captions.entries()) {
    await stage.evaluate((el, html) => { el.setAttribute("class", ""); el.innerHTML = html; }, captionHtml(c.step, c.text));
    await page.evaluate(() => document.fonts.ready);
    c.image = `cap-${String(n).padStart(2, "0")}.png`;
    await page.locator(".vid-cap").screenshot({ path: join(dir, c.image) });
  }
  await stage.evaluate((el, html) => { el.setAttribute("class", "is-title"); el.innerHTML = html; }, titleHtml(take.network, take.date));
  await page.evaluate(() => document.fonts.ready);
  take.title = "title.png";
  await page.screenshot({ path: join(dir, take.title) });
  await context.close();
}
