/**
 * The single source of colour for the tape design system (spec
 * docs/superpowers/specs/2026-09-24-tape-design-system-design.md §4.1).
 * CSS variables, the antd theme and the contrast test all read from here, so
 * a colour cannot drift between them. test/theme-tokens.test.ts keeps every
 * pair above WCAG AA.
 */
export type Mode = "dark" | "light";

export interface Palette {
  /** The page: the desk the tape lies on. */
  desk: string;
  /** Sidebar and bottom tabs. */
  deskDeep: string;
  /** Every block: paper from the roll. */
  tape: string;
  /** Row hover, selected items, code on tape. */
  tapeShade: string;
  /** Dotted leaders and separators. Decorative only — WCAG exempts them. */
  rule: string;
  /** Edges a user must see to operate: inputs, outline buttons, chips. ≥ 3:1. */
  control: string;
  ink: string;
  inkSoft: string;
  /** The adding machine's red ribbon: wrong, short, failed. */
  ribbon: string;
  ribbonBg: string;
  /** Look at this. A fill only; text on it is always onHighlight. */
  highlight: string;
  onHighlight: string;
  /** antd's warning icons, nothing else. */
  warning: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  focus: string;
}

export const palettes: Record<Mode, Palette> = {
  light: {
    desk: "#E2E0DA", deskDeep: "#D6D3CB", tape: "#FDFDFA", tapeShade: "#F0EEE8",
    rule: "#B9B7B0", control: "#77756D",
    ink: "#161616", inkSoft: "#55544F",
    ribbon: "#AC0D26", ribbonBg: "#FBE4E6",
    highlight: "#FFE45C", onHighlight: "#161616",
    warning: "#6E5200",
    accent: "#161616", accentHover: "#3A3935", onAccent: "#FDFDFA",
    focus: "#161616",
  },
  dark: {
    desk: "#121211", deskDeep: "#0B0B0A", tape: "#262521", tapeShade: "#31302B",
    rule: "#45433D", control: "#8A877E",
    ink: "#F2F1EC", inkSoft: "#AEACA3",
    ribbon: "#FF7A7A", ribbonBg: "#3D1C1E",
    highlight: "#F4D63D", onHighlight: "#161616",
    warning: "#F4D63D",
    accent: "#F2F1EC", accentHover: "#CFCDC5", onAccent: "#121211",
    focus: "#F2F1EC",
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
