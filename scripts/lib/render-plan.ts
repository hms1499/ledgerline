/**
 * The render, decided before a pixel moves: for every 1/fps of the video,
 * which source frame, which crop and which caption. Driven by the output
 * clock, not the screencast's: the screencast sends a frame only when the
 * page changes, so a zoom over a still page has one frame to work with.
 */
import { buildTimeline } from "./timeline.js";
import { cameraAt, cropFor, MOVE, type Crop } from "./camera.js";
import type { TakeEvents } from "./take.js";

export interface RenderOptions { fps: number; titleSeconds: number; waitSpeed: number }
export type Planned =
  | { kind: "title" }
  | { kind: "shot"; source: number; crop: Crop; caption: number | undefined };

/** A zoom past the frame's own device pixels would only blur. */
export const maxZoomFor = (scale: number) => Math.min(2, scale);

export function renderPlan(take: TakeEvents, o: RenderOptions) {
  const inWait = (t: number) => take.waits.some((w) => t >= w.from && t < w.to);
  const tl = buildTimeline(take.frames, take.end, (t) => (inWait(t) ? o.waitSpeed : 1));
  const view = { width: take.view.width, height: take.view.height };
  const maxZoom = maxZoomFor(take.view.scale);
  const focuses = take.focuses.map((f) => ({ at: tl.outputTime(f.at), rect: f.rect, zoom: f.zoom }));
  const captionsAt = take.captions.map((c) => tl.outputTime(c.at));

  const seconds = o.titleSeconds + tl.total;
  const count = Math.round(seconds * o.fps);
  const frames: Planned[] = [];
  for (let k = 0; k < count; k++) {
    const T = k / o.fps;
    if (T < o.titleSeconds) { frames.push({ kind: "title" }); continue; }
    const t = T - o.titleSeconds;
    let caption: number | undefined;
    captionsAt.forEach((at, i) => { if (at <= t) caption = i; });
    frames.push({
      kind: "shot",
      source: tl.frameAt(t),
      crop: cropFor(cameraAt(t, focuses, view, maxZoom), view, take.view.scale),
      caption,
    });
  }
  const sheet = focuses
    .filter((f) => f.rect)
    .map((f) => Math.min(count - 1, Math.round((o.titleSeconds + f.at + MOVE + 0.3) * o.fps)));
  return { frames, seconds, sheet };
}

/** ffmpeg inputs and the audio filter, labelled [a]. Input 0 is the video.
 *  A missing music file fails here, before minutes of rendering. */
export function audioArgs(music: string | undefined, seconds: number, exists: (path: string) => boolean): string[] {
  if (music && !exists(music)) throw new Error(`no music file at ${music}`);
  const s = Number(seconds.toFixed(3));
  if (!music) {
    return ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex", `[1:a]atrim=0:${s},asetpts=PTS-STARTPTS[a]`];
  }
  return ["-stream_loop", "-1", "-i", music,
    "-filter_complex",
    `[1:a]atrim=0:${s},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st=${Number((s - 2).toFixed(3))}:d=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`];
}
