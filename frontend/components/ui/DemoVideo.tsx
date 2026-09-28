"use client";

import {
  useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties,
} from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DEMO_RUN, WIDE_QUERY, demoClip, type DemoLayout } from "@/lib/demo-run";

function watchWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;
// The server cannot see the screen. Harmless: nothing loads until the client
// has decided, because the video is preload="none" and the poster is CSS's.
const isWideOnServer = () => true;

/**
 * The home page's demo: a real run on Arc testnet, muted and on a loop. It
 * plays only while it is on screen, starts on its own only for a viewer who
 * has not asked for less motion, and can always be paused (WCAG 2.2.2).
 * Wide screens get the desktop recording, narrower ones the phone recording,
 * each in the page's theme.
 */
export default function DemoVideo() {
  const { mode } = useTheme();
  const layout: DemoLayout = useSyncExternalStore(watchWide, isWide, isWideOnServer) ? "wide" : "phone";
  const clip = demoClip(layout, mode);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Once the viewer presses Play or Pause, that outlasts a change of theme or width.
  const [chosen, setChosen] = useState<"play" | "pause">();
  const [inView, setInView] = useState(false);
  const descId = useId();

  // Half on screen or more. It sits below the fold, and a video nobody can
  // see should not spend anyone's data.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)), { threshold: 0.5 });
    io.observe(v);
    return () => io.disconnect();
  }, [clip.src]);

  useEffect(() => {
    const v = video.current;
    // The first render follows the server's guesses at theme and width; the
    // corrections arrive a moment later. Starting now would fetch a
    // megabyte of the wrong recording.
    const settled = document.documentElement.getAttribute("data-theme") === mode
      && isWide() === (layout === "wide");
    if (!v || !settled) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wanted = chosen === "play" || (chosen === undefined && !still);
    if (wanted && inView) {
      v.muted = true;
      v.play().catch(() => setPlaying(false));
    } else if (!v.paused) {
      v.pause();
    }
  }, [mode, layout, chosen, inView]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setChosen("pause");
    } else {
      v.muted = true;
      void v.play().catch(() => setPlaying(false));
      setChosen("play");
    }
  };

  // Posters in CSS, not the poster attribute: CSS knows the theme and the
  // width before React does, so the first paint is already the right one and
  // the other three are never fetched.
  const c = DEMO_RUN.clips;
  const posters = {
    "--poster-wide-light": `url(${c.wide.light.poster})`,
    "--poster-wide-dark": `url(${c.wide.dark.poster})`,
    "--poster-phone-light": `url(${c.phone.light.poster})`,
    "--poster-phone-dark": `url(${c.phone.dark.poster})`,
  } as CSSProperties;

  return (
    <figure className="demo" style={posters}>
      <video
        key={clip.src}
        ref={video}
        className="demo-video"
        src={clip.src}
        width={clip.width}
        height={clip.height}
        muted
        loop
        playsInline
        preload="none"
        aria-label="Recording of a payout run"
        aria-describedby={descId}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <figcaption className="demo-foot">
        <button type="button" className="demo-toggle" onClick={toggle}>
          <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
          {playing ? "Pause" : "Play"}
          <span className="sr-only"> the recording</span>
        </button>
        <span id={descId} className="because">
          Three invoices uploaded, checked against the chain, paid in one transaction, and
          the first recipient&apos;s receipt verified. Recorded in this app on {DEMO_RUN.recorded}.{" "}
          <a href={clip.receipt}>Open that receipt</a>
          {" · "}
          <a href={`${DEMO_RUN.explorer}/tx/${clip.txHash}`} target="_blank" rel="noreferrer">
            the transaction ↗
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
