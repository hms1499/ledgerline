"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DEMO_RUN, demoClip } from "@/lib/demo-run";

/**
 * The home page's demo: a real run on Arc testnet, muted and on a loop. It
 * starts on its own only for a viewer who has not asked for less motion, and
 * can always be paused (WCAG 2.2.2). Each theme plays its own recording.
 */
export default function DemoVideo() {
  const { mode } = useTheme();
  const clip = demoClip(mode);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Once the viewer presses Play or Pause, that outlasts a change of theme.
  const [chosen, setChosen] = useState<"play" | "pause">();
  const descId = useId();

  useEffect(() => {
    const v = video.current;
    // The first render follows the server's guess at the theme, which the
    // boot script may already have corrected; ThemeProvider catches up a
    // moment later. Starting now would fetch a megabyte of the wrong video.
    if (!v || document.documentElement.getAttribute("data-theme") !== mode) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (chosen === "play" || (chosen === undefined && !still)) {
      v.muted = true;
      v.play().catch(() => setPlaying(false));
    }
  }, [mode, chosen]);

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

  // Posters by theme in CSS, not the poster attribute: CSS knows the theme
  // before React does, so the first paint is already the right one and the
  // other image is never fetched.
  const posters = {
    "--poster-light": `url(${DEMO_RUN.clips.light.poster})`,
    "--poster-dark": `url(${DEMO_RUN.clips.dark.poster})`,
  } as CSSProperties;

  return (
    <figure className="demo" style={posters}>
      <video
        key={clip.src}
        ref={video}
        className="demo-video"
        src={clip.src}
        width={DEMO_RUN.width}
        height={DEMO_RUN.height}
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
