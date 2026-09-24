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

/** antd computes colour in JS; these tokens pin it to the tape system
 *  (spec §6.4). CSS covers the rest, in app/styles/antd.css. */
export function antdTheme(mode: Mode): ThemeConfig {
  const p = palettes[mode];
  const popup = `0 1px 0 ${p.rule}, 0 12px 28px -12px rgb(0 0 0 / 0.35)`;
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // Paper is cut square.
      borderRadius: 0, borderRadiusLG: 0, borderRadiusSM: 0, borderRadiusXS: 0, borderRadiusOuter: 0,
      colorPrimary: p.accent,
      colorPrimaryHover: p.accentHover,
      colorPrimaryActive: p.accentHover,
      colorLink: p.ink, colorLinkHover: p.ink, colorLinkActive: p.ink,
      colorInfo: p.ink,
      // Only exceptions get colour: a success is black ink with ✓ and words.
      colorSuccess: p.ink,
      colorWarning: p.warning,
      colorError: p.ribbon,
      colorText: p.ink,
      colorTextHeading: p.ink,
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
      fontFamily: "var(--font-sans)",
      fontFamilyCode: "var(--font-mono)",
      fontSize: 15,
      lineHeight: 1.6,
      // Only popups rise off the page.
      boxShadow: popup,
      boxShadowSecondary: popup,
    },
    components: {
      Button: { primaryShadow: "none", defaultShadow: "none", dangerShadow: "none", fontWeight: 600 },
      Table: {
        headerBg: p.tape, headerColor: p.inkSoft, headerSplitColor: "transparent",
        rowHoverBg: p.tapeShade, borderColor: p.rule, footerBg: p.tape,
      },
      Tag: {
        defaultBg: "transparent", defaultColor: p.ink,
        colorSuccess: p.ink, colorSuccessBg: "transparent", colorSuccessBorder: "transparent",
        colorWarning: p.onHighlight, colorWarningBg: p.highlight, colorWarningBorder: p.highlight,
        colorError: p.ribbon, colorErrorBg: p.ribbonBg, colorErrorBorder: p.ribbonBg,
      },
      Alert: {
        colorInfoBg: p.tape, colorSuccessBg: p.tape, colorWarningBg: p.tape, colorErrorBg: p.tape,
        colorInfoBorder: "transparent", colorSuccessBorder: "transparent",
        colorWarningBorder: "transparent", colorErrorBorder: "transparent",
      },
      Steps: { colorTextDescription: p.inkSoft },
      Segmented: { itemSelectedBg: p.accent, itemSelectedColor: p.onAccent, trackBg: "transparent" },
      Input: { activeBorderColor: p.ink, hoverBorderColor: p.ink, activeShadow: `0 0 0 1px ${p.ink}` },
      Modal: { contentBg: p.tape, headerBg: p.tape, footerBg: p.tape },
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
