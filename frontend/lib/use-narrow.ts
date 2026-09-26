"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 639px)";

/** The `sm` breakpoint the shell already uses (shell.css). False on the server. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
