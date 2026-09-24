import { theme, type ThemeConfig } from "antd";
import { palettes, type Mode } from "@/lib/theme-tokens";

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_COOKIE = "theme";
export const SYSTEM_COOKIE = "theme-system";

/**
 * What the server renders. Only two fixed strings ever leave this function,
 * so nothing from a cookie can reach the HTML. Missing or unknown means
 * "system"; system with no recorded value is dark, the product default.
 */
export function resolveTheme(
  themeCookie?: string | null, systemCookie?: string | null,
): { choice: ThemeChoice; mode: Mode } {
  const choice: ThemeChoice =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : "system";
  if (choice !== "system") return { choice, mode: choice };
  return { choice, mode: systemCookie === "light" ? "light" : "dark" };
}

export function themeCookie(name: string, value: string): string {
  return `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** antd computes colour in JS; these tokens pin it to our palette. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorLink: p.link,
      colorInfo: p.link,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.danger,
      colorText: p.text,
      colorTextSecondary: p.textSoft,
      colorTextTertiary: p.textSoft,
      colorTextDescription: p.textSoft,
      colorTextPlaceholder: p.textSoft,
      colorTextLightSolid: p.onAccent,
      colorBgBase: p.bg,
      colorBgLayout: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.surface,
      colorBorder: p.control,
      colorBorderSecondary: p.border,
      colorSuccessBg: p.successBg,
      colorWarningBg: p.warningBg,
      colorErrorBg: p.dangerBg,
      colorInfoBg: p.raised,
      borderRadius: 6,
      fontFamily: "var(--font-sans)",
      fontSize: 15,
      lineHeight: 1.6,
    },
    components: {
      Table: { headerBg: p.surface, rowHoverBg: p.raised, borderColor: p.border, footerBg: p.surface },
      Tag: { defaultBg: p.raised, defaultColor: p.text },
      Alert: {
        colorInfoBorder: p.border, colorSuccessBorder: p.border,
        colorWarningBorder: p.border, colorErrorBorder: p.border,
      },
      Steps: { colorTextDescription: p.textSoft },
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
