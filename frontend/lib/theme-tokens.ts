/**
 * The single source of colour. CSS variables, the antd theme and the contrast
 * test all read from here, so a colour cannot drift between them. Every value
 * was measured against WCAG 2 before it went in (spec §5.1); the test in
 * test/theme-tokens.test.ts keeps it that way.
 */
export type Mode = "dark" | "light";

export interface Palette {
  bg: string; surface: string; raised: string; sidebar: string;
  /** Decorative rules only — WCAG exempts them. */
  border: string;
  /** Edges a user must see to operate: inputs, outline buttons, the wallet chip. ≥ 3:1. */
  control: string;
  text: string; textSoft: string; link: string;
  accent: string; onAccent: string;
  success: string; warning: string; danger: string;
  successBg: string; warningBg: string; dangerBg: string;
}

export const palettes: Record<Mode, Palette> = {
  dark: {
    bg: "#0B1220", surface: "#101929", raised: "#15213A", sidebar: "#080E1A",
    border: "#1B2436", control: "#5F7090",
    text: "#E4E9F2", textSoft: "#98A3B8", link: "#7FB0FF",
    accent: "#4C8DFF", onAccent: "#051024",
    success: "#5EE0A0", warning: "#F2C35B", danger: "#FF8C9B",
    successBg: "#0F3326", warningBg: "#33290F", dangerBg: "#3B1720",
  },
  light: {
    bg: "#F5F7FB", surface: "#FFFFFF", raised: "#E8EFFB", sidebar: "#EEF2F8",
    border: "#DCE3EE", control: "#7C889E",
    text: "#0E1726", textSoft: "#4F5B70", link: "#1A56C4",
    accent: "#1F5FD6", onAccent: "#FFFFFF",
    success: "#0B6E48", warning: "#7A5000", danger: "#B0222E",
    successBg: "#E2F4EC", warningBg: "#FBF0D9", dangerBg: "#FBE4E6",
  },
};

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
export function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Both themes as CSS custom properties, keyed on html[data-theme]. */
export function tokenCss(): string {
  return (["dark", "light"] as const).map((mode) => {
    const vars = Object.entries(palettes[mode]).map(([k, v]) => `--${kebab(k)}:${v}`).join(";");
    return `html[data-theme="${mode}"]{color-scheme:${mode};${vars}}`;
  }).join("");
}
