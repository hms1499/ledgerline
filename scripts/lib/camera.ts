/**
 * The video's camera, decided after the recording: where it looks and how
 * close, at every moment. Coordinates are the page's CSS pixels in the
 * viewport, as Playwright's boundingBox reports them; the render turns a
 * camera into a crop of the device-pixel frame.
 */
export interface Rect { x: number; y: number; width: number; height: number }
export interface View { width: number; height: number }
export interface Camera { cx: number; cy: number; scale: number }
/** A moment the script asked the camera to look at something. `rect: null`
 *  is the wide shot. */
export interface Focus { at: number; rect: Rect | null; zoom?: number }
export interface Crop { left: number; top: number; width: number; height: number }

export const PAD = 48;
export const MOVE = 0.7;

export const easeInOut = (u: number): number =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;

export const wideShot = (view: View): Camera => ({ cx: view.width / 2, cy: view.height / 2, scale: 1 });

function clamp(c: Camera, view: View): Camera {
  const scale = Math.max(1, c.scale);
  const hw = view.width / (2 * scale);
  const hh = view.height / (2 * scale);
  return {
    scale,
    cx: Math.min(Math.max(c.cx, hw), view.width - hw),
    cy: Math.min(Math.max(c.cy, hh), view.height - hh),
  };
}

export function framing(rect: Rect | null, view: View, maxZoom: number, zoom?: number): Camera {
  if (!rect) return wideShot(view);
  const fit = Math.min(view.width / (rect.width + 2 * PAD), view.height / (rect.height + 2 * PAD));
  const scale = Math.min(maxZoom, Math.max(1, zoom ?? fit));
  return clamp({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, scale }, view);
}

/** Position eases linearly; scale eases in log space, so a zoom feels even. */
function between(a: Camera, b: Camera, u: number, view: View): Camera {
  const e = easeInOut(u);
  if (e <= 0) return clamp(a, view);
  if (e >= 1) return clamp(b, view);
  return clamp({
    cx: a.cx + (b.cx - a.cx) * e,
    cy: a.cy + (b.cy - a.cy) * e,
    scale: Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * e),
  }, view);
}

const progress = (t: number, at: number) => Math.min(1, Math.max(0, (t - at) / MOVE));

/** `focuses` sorted by `at`. A move that starts before the last one finished
 *  starts from wherever the camera is, so nothing jumps. */
export function cameraAt(t: number, focuses: readonly Focus[], view: View, maxZoom: number): Camera {
  let start = wideShot(view);
  let target = start;
  let since = -Infinity;
  for (const f of focuses) {
    if (f.at > t) break;
    start = between(start, target, progress(f.at, since), view);
    target = framing(f.rect, view, maxZoom, f.zoom);
    since = f.at;
  }
  return since === -Infinity ? start : between(start, target, progress(t, since), view);
}

export function cropFor(cam: Camera, view: View, deviceScale: number): Crop {
  const W = Math.round(view.width * deviceScale);
  const H = Math.round(view.height * deviceScale);
  const width = Math.min(W, Math.round(W / cam.scale));
  const height = Math.min(H, Math.round((width * H) / W));
  const left = Math.min(W - width, Math.max(0, Math.round((cam.cx - view.width / (2 * cam.scale)) * deviceScale)));
  const top = Math.min(H - height, Math.max(0, Math.round((cam.cy - view.height / (2 * cam.scale)) * deviceScale)));
  return { left, top, width, height };
}
