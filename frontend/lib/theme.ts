import { theme, type ThemeConfig } from "antd";
import { palettes, type Mode } from "@/lib/theme-tokens";

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_COOKIE = "theme";
export const SYSTEM_COOKIE = "theme-system";

/**
 * What the server renders. Only two fixed strings ever leave this function,
 * so nothing from a cookie can reach the HTML. Missing or unknown means
 * "system"; system with no recorded value is light, the product default
 * (tape spec §10): paper on a desk is a light-first world.
 */
export function resolveTheme(
  themeCookie?: string | null, systemCookie?: string | null,
): { choice: ThemeChoice; mode: Mode } {
  const choice: ThemeChoice =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : "system";
  if (choice !== "system") return { choice, mode: choice };
  return { choice, mode: systemCookie === "dark" ? "dark" : "light" };
}

export function themeCookie(name: string, value: string): string {
  return `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** antd computes colour in JS; these tokens pin it to our palette. Task 5 of
 *  the tape plan adds shape, faces and the component tokens. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorLink: p.ink,
      colorInfo: p.ink,
      // Only exceptions get colour: a success is black ink with ✓ and words.
      colorSuccess: p.ink,
      colorWarning: p.warning,
      colorError: p.ribbon,
      colorText: p.ink,
      colorTextSecondary: p.inkSoft,
      colorTextTertiary: p.inkSoft,
      colorTextDescription: p.inkSoft,
      colorTextPlaceholder: p.inkSoft,
      colorTextLightSolid: p.onAccent,
      colorBgBase: p.desk,
      colorBgLayout: p.desk,
      colorBgContainer: p.tape,
      colorBgElevated: p.tape,
      colorBorder: p.control,
      colorBorderSecondary: p.rule,
      colorSuccessBg: p.tapeShade,
      colorWarningBg: p.highlight,
      colorErrorBg: p.ribbonBg,
      colorInfoBg: p.tapeShade,
      borderRadius: 6,
      fontFamily: "var(--font-sans)",
      fontSize: 15,
      lineHeight: 1.6,
    },
    components: {
      Table: { headerBg: p.tape, rowHoverBg: p.tapeShade, borderColor: p.rule, footerBg: p.tape },
      Tag: { defaultBg: p.tapeShade, defaultColor: p.ink },
      Alert: {
        colorInfoBorder: p.rule, colorSuccessBorder: p.rule,
        colorWarningBorder: p.rule, colorErrorBorder: p.rule,
      },
      Steps: { colorTextDescription: p.inkSoft },
    },
  };
}

/**
 * Runs in <head> before first paint. When the user has not chosen, it applies
 * the system preference to our CSS and records it for the next server render.
 * It never touches the `theme` cookie, so "system" keeps following the OS,
 * and it swallows every error — a browser without matchMedia stays dark.
 */
export const BOOT_SCRIPT =
  `(function(){try{var d=document.documentElement;` +
  `if(d.getAttribute("data-theme-choice")!=="system")return;` +
  `if(!window.matchMedia)return;` +
  `var m=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";` +
  `d.setAttribute("data-theme",m);` +
  `document.cookie="${SYSTEM_COOKIE}="+m+"; path=/; max-age=31536000; samesite=lax"` +
  `}catch(e){}})();`;
