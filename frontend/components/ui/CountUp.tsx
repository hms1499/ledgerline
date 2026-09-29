"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { COUNT_MS, countAt, firstShown } from "@/lib/count-up";

const noChange = () => () => {};
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A count that counts (spec 2026-09-29 §2.4). It rolls in whole numbers from
 * 0 when it first appears on the client, and from its old value when the
 * value changes, landing exactly on `value`. A count already in the server's
 * HTML shows its value and does not roll on hydration. Screen readers get the
 * value once, from a visually hidden copy; the rolling figure is hidden from
 * them. While it rolls it carries `data-counting`, which the recorders wait
 * on. Never give it an amount: a token amount is printed, not rolled.
 *
 * Under React's development StrictMode the effect runs twice and the second
 * run lands at once; `next start` rolls.
 */
export default function CountUp({ value }: { value: number }) {
  // React reads the server snapshot while hydrating; a client-only mount reads false.
  const hydrating = useSyncExternalStore(noChange, () => false, () => true);
  const [shown, setShown] = useState(() => firstShown(value, hydrating, reducedMotion()));
  const from = useRef<number | null>(hydrating ? value : null);

  useEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || reducedMotion()) { setShown(value); return; }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setShown(countAt(start, value, now - t0));
      if (now - t0 < COUNT_MS) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span
        className="count-up" aria-hidden="true" data-counting={shown === value ? undefined : ""}
        style={{ minWidth: `${String(value).length}ch` }}
      >
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
