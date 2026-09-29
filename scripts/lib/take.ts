/**
 * A take: one recording's frames and everything the script said about them.
 * The render reads only this, so a take can be re-rendered any number of
 * times without another payment.
 */
import type { Rect, View } from "./camera.js";
import type { DemoNetwork } from "./demo-wallet.js";

export interface TakeEvents {
  version: 1;
  network: DemoNetwork;
  runName: string;
  /** YYYY-MM-DD, the day it was recorded. */
  date: string;
  txHash?: string;
  view: { width: number; height: number; scale: number };
  begin: number;
  end: number;
  /** `file` relative to the take's folder. */
  frames: { file: string; at: number }[];
  waits: { from: number; to: number }[];
  focuses: { at: number; rect: Rect | null; zoom?: number; label: string }[];
  captions: { at: number; step: string; text: string; image?: string }[];
  /** The title card's PNG, relative to the take's folder. */
  title?: string;
}

export function assertTake(value: unknown): TakeEvents {
  const t = value as TakeEvents;
  if (t?.version !== 1) throw new Error("not a take: version is not 1");
  if (t.network !== "testnet" && t.network !== "mainnet") {
    throw new Error(`a take's network must be testnet or mainnet, got ${String(t.network)}`);
  }
  if (!Array.isArray(t.frames) || t.frames.length === 0) throw new Error("the take has no frames");
  for (let i = 1; i < t.frames.length; i++) {
    if (t.frames[i]!.at < t.frames[i - 1]!.at) throw new Error(`frames out of order at ${i}`);
  }
  if (!(t.end > t.begin)) throw new Error(`the take's end (${t.end}) is not after its begin (${t.begin})`);
  return t;
}

/** What of an element is on screen. A focus on nothing would frame empty
 *  space for seconds, so it stops the take instead. */
export function visibleRect(box: Rect | null, view: View, label: string): Rect {
  if (!box) throw new Error(`cannot focus ${label}: it has no box on the page`);
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(view.width, box.x + box.width);
  const bottom = Math.min(view.height, box.y + box.height);
  if (right <= x || bottom <= y) throw new Error(`cannot focus ${label}: it is outside the viewport`);
  return { x, y, width: right - x, height: bottom - y };
}

export function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}
