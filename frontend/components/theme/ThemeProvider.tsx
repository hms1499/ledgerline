"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ConfigProvider } from "antd";
import type { Mode } from "@/lib/theme-tokens";
import {
  antdTheme, themeCookie, THEME_COOKIE, SYSTEM_COOKIE, type ThemeChoice,
} from "@/lib/theme";

interface ThemeApi { choice: ThemeChoice; mode: Mode; setChoice: (c: ThemeChoice) => void }
const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext);
  if (!api) throw new Error("useTheme must be used inside ThemeProvider");
  return api;
}

const systemMode = (): Mode =>
  window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

export function ThemeProvider({
  initial, children,
}: { initial: { choice: ThemeChoice; mode: Mode }; children: React.ReactNode }) {
  const [choice, setChoiceState] = useState(initial.choice);
  const [mode, setMode] = useState(initial.mode);

  const apply = useCallback((m: Mode) => {
    document.documentElement.setAttribute("data-theme", m);
    setMode(m);
  }, []);

  // The boot script may already have moved our CSS to the system theme; antd
  // follows it here. This is the one re-colour the spec accepts (§5.3).
  useEffect(() => {
    const m = document.documentElement.getAttribute("data-theme");
    if (m === "dark" || m === "light") setMode(m);
  }, []);

  // While following the system, follow it live.
  useEffect(() => {
    if (choice !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const m = mq.matches ? "light" : "dark";
      document.cookie = themeCookie(SYSTEM_COOKIE, m);
      apply(m);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice, apply]);

  const setChoice = useCallback((c: ThemeChoice) => {
    document.cookie = themeCookie(THEME_COOKIE, c);
    document.documentElement.setAttribute("data-theme-choice", c);
    setChoiceState(c);
    apply(c === "system" ? systemMode() : c);
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ choice, mode, setChoice }}>
      <ConfigProvider theme={antdTheme(mode)}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
