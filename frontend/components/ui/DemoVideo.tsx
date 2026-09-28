"use client";

import {
  useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties,
} from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  DEMO_BRIDGE, DEMO_RUN, DEMO_STEPS, WIDE_QUERY, chapterAt, demoClip, type DemoLayout,
} from "@/lib/demo-run";

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
 * each in the page's theme. Under it, a feed line and five chapters follow
 * the video; pressing a chapter plays from there.
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
  const feed = useRef<HTMLSpanElement>(null);
  // -1 until the video has played: the poster is a frame from Check, so
  // highlighting Upload over it would say something untrue.
  const [chapter, setChapter] = useState(-1);
  const shown = useRef(-1);

  // The rail and the feed line follow the video itself: one frame loop while
  // it plays, one read when it pauses or seeks. The feed line is written
  // straight to the DOM, so a frame costs no React render; the chapter is
  // state, and changes only when the chapter does.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    shown.current = -1;
    setChapter(-1);
    let raf = 0;
    const draw = () => {
      const p = v.duration > 0 ? Math.min(1, v.currentTime / v.duration) : 0;
      if (feed.current) feed.current.style.transform = `translateX(${(p - 1) * 100}%)`;
      if (v.paused && v.currentTime === 0) return;
      const c = chapterAt(clip.chapters, v.currentTime);
      if (c !== shown.current) { shown.current = c; setChapter(c); }
    };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); draw(); };
    v.addEventListener("play", start);
    v.addEventListener("pause", stop);
    v.addEventListener("ended", stop);
    v.addEventListener("seeked", draw);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", start);
      v.removeEventListener("pause", stop);
      v.removeEventListener("ended", stop);
      v.removeEventListener("seeked", draw);
    };
  }, [clip]);

  /** A chapter pressed is the viewer choosing Play, as the Play button is. The
   *  0.05s keeps the seek off the previous chapter's last frame. */
  const seek = (i: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = clip.chapters[i]! + 0.05;
    v.muted = true;
    void v.play().catch(() => setPlaying(false));
    setChosen("play");
  };

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
      <div className="demo-feed" aria-hidden="true"><span ref={feed} /></div>
      <ol className={`demo-chapters is-${layout}`} aria-label="Chapters">
        {DEMO_STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" aria-current={i === chapter ? "step" : undefined} onClick={() => seek(i)}>
              <span className="demo-chapter-n">{i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>
      <figcaption className="demo-foot">
        <button type="button" className="demo-toggle" onClick={toggle}>
          {/* Both faces are laid out and one is hidden, so the button keeps
              one width and the text beside it never shifts when the video
              starts or stops. */}
          <span className="demo-toggle-faces" aria-hidden="true">
            <span className={playing ? undefined : "is-off"}><span>❚❚</span>Pause</span>
            <span className={playing ? "is-off" : undefined}><span>▶</span>Play</span>
          </span>
          <span className="sr-only">{playing ? "Pause" : "Play"} the recording</span>
        </button>
        <span id={descId} className="because">
          Three invoices uploaded, checked against the chain, paid in one transaction, and
          the first recipient&apos;s receipt verified, in this app on {DEMO_RUN.recorded}.{" "}
          {DEMO_BRIDGE}{" "}
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
