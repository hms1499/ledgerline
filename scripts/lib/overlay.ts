/**
 * What the walkthrough draws over the app. Captions and the title card are
 * HTML rendered by Chromium from a page of the running app, so they use the
 * site's fonts and tokens (spec §5); the pointer is drawn in the page while
 * recording, so the camera zooms it with everything else.
 */
import type { Rect } from "./camera.js";
import type { DemoNetwork } from "./demo-wallet.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Spelled out rather than formatted: ICU versions disagree (see paidAtText). */
export function dateText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export const OVERLAY_CSS = `
#vid-stage { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; pointer-events: none; }
#vid-stage.is-title { background: var(--desk); }
.vid-cap { display: flex; align-items: center; gap: 18px; max-width: 1500px; padding: 18px 28px;
  background: var(--ink); color: var(--tape); font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 34px; line-height: 1.3; }
.vid-cap .step { flex: none; padding: 4px 12px; background: var(--highlight); color: var(--on-highlight);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 22px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; }
.vid-title { width: 1200px; padding: 64px 72px; background: var(--tape); color: var(--ink); }
.vid-title .mark { font-family: var(--font-mono), ui-monospace, monospace; font-size: 30px; font-weight: 700; letter-spacing: 0.12em; }
.vid-title h1 { margin: 36px 0 20px; font-family: var(--font-sans), system-ui, sans-serif; font-size: 76px; line-height: 1.05; }
.vid-title p { margin: 0; font-family: var(--font-sans), system-ui, sans-serif; font-size: 32px; color: var(--ink-soft); }
.vid-title .foot { margin-top: 48px; padding-top: 20px; border-top: 1.5px dashed var(--ink);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 22px; letter-spacing: 0.06em; text-transform: uppercase; }
`;

export function captionHtml(step: string, text: string): string {
  if (text.length > 80) throw new Error(`a caption holds at most 80 characters, got ${text.length}: "${text}"`);
  return `<div class="vid-cap"><span class="step">${escapeHtml(step)}</span><span>${escapeHtml(text)}</span></div>`;
}

export function titleHtml(network: DemoNetwork, isoDate: string): string {
  return `<div class="vid-title"><div class="mark">✱ LEDGERLINE</div>`
    + `<h1>A payment that carries its own invoice</h1>`
    + `<p>Batched stablecoin payouts on Arc, reconcilable by payer and recipient without trusting each other.</p>`
    + `<div class="foot">Recorded on Arc ${network} · ${dateText(isoDate)}</div></div>`;
}

export const centre = (box: Rect) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Plain JavaScript in a string, for addInitScript (see WALLET_ANNOUNCE). */
export const POINTER_SETUP = String.raw`(() => {
  const ensure = () => {
    let p = document.getElementById("vid-pointer");
    if (p) return p;
    p = document.createElement("div");
    p.id = "vid-pointer";
    p.setAttribute("aria-hidden", "true");
    p.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 16.5 L13 25 L16.5 23.5 L13 15 L21 15 Z" fill="#161616" stroke="#FDFDFA" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const style = document.createElement("style");
    style.textContent = "#vid-pointer{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}"
      + "#vid-pointer.moving{transition:transform .6s cubic-bezier(.65,0,.35,1)}"
      + ".vid-ripple{position:fixed;z-index:2147483645;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #FFE45C;animation:vid-ripple .5s ease-out forwards}"
      + "@keyframes vid-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}";
    document.head.append(style);
    document.body.append(p);
    return p;
  };
  const at = (p, x, y) => { p.style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)"; };
  window.__pointerTo = (x, y) => { const p = ensure(); p.classList.add("moving"); at(p, x, y); };
  window.__pointerPlace = (x, y) => { const p = ensure(); p.classList.remove("moving"); at(p, x, y); };
  window.__pointerRipple = (x, y) => {
    const r = document.createElement("div");
    r.className = "vid-ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    document.body.append(r);
    setTimeout(() => r.remove(), 600);
  };
  // The screencast drops frames drawn while it waits for an ack, and a page
  // that then stays still never sends its final state: the rehearsal lost a
  // run page's loaded table that way. An invisible 1px heartbeat redraws five
  // times a second, so the newest state is always on a frame within 200 ms.
  // Added after load, so it never meets React's hydration.
  const heartbeat = () => {
    if (document.getElementById("vid-heartbeat")) return;
    const h = document.createElement("div");
    h.id = "vid-heartbeat";
    h.setAttribute("aria-hidden", "true");
    const style = document.createElement("style");
    style.textContent = "#vid-heartbeat{position:fixed;left:0;bottom:0;width:1px;height:1px;z-index:2147483644;pointer-events:none;background:#000;opacity:.004;animation:vid-beat .4s steps(1) infinite}"
      + "@keyframes vid-beat{50%{opacity:.008}}";
    document.head.append(style);
    document.body.append(h);
  };
  if (document.readyState === "complete") setTimeout(heartbeat, 0);
  else window.addEventListener("load", () => setTimeout(heartbeat, 0));
})();`;
