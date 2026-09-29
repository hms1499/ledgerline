"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The page's wrapper for page-in and stagger (spec 2026-09-29 §2.1–2.2). The
 * entrance plays from the server's HTML; once this page's own page-in has
 * settled — at once, if none ran — the wrapper marks itself arrived and the
 * entrance rules stop applying. A block swapped in later (a skeleton's
 * replacement after a chain read, the Run summary beside New's step) then
 * appears as it is, instead of fading out and staggering in again.
 */
export default function PageIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const entrance = el.getAnimations({ subtree: true })
      .filter((a) => a instanceof CSSAnimation && a.animationName === "page-in");
    // A block removed mid-entrance cancels its animation: settled, not stuck.
    void Promise.allSettled(entrance.map((a) => a.finished)).then(() => { if (live) setArrived(true); });
    return () => { live = false; };
  }, []);

  return <div ref={ref} className="page-in" data-arrived={arrived ? "" : undefined}>{children}</div>;
}
