import { describe, it, expect } from "vitest";
import { theme as antd } from "antd";
import { resolveTheme, antdTheme, BOOT_SCRIPT, themeCookie } from "@/lib/theme";
import { palettes } from "@/lib/theme-tokens";

describe("resolveTheme", () => {
  it("honours an explicit choice whatever the system says", () => {
    expect(resolveTheme("light", "dark")).toEqual({ choice: "light", mode: "light" });
    expect(resolveTheme("dark", "light")).toEqual({ choice: "dark", mode: "dark" });
  });
  it("follows the recorded system value when the choice is system or missing", () => {
    expect(resolveTheme("system", "light")).toEqual({ choice: "system", mode: "light" });
    expect(resolveTheme("system", "dark")).toEqual({ choice: "system", mode: "dark" });
    expect(resolveTheme(undefined, "dark")).toEqual({ choice: "system", mode: "dark" });
  });
  it("renders light on a first visit, before the system value is known", () => {
    expect(resolveTheme(undefined, undefined)).toEqual({ choice: "system", mode: "light" });
  });
  it("treats a garbage or hostile cookie as system, never echoing it", () => {
    const r = resolveTheme("</script><script>alert(1)", "<b>");
    expect(r).toEqual({ choice: "system", mode: "light" });
  });
});

describe("antdTheme", () => {
  it("uses the dark algorithm and the dark palette in dark mode", () => {
    const t = antdTheme("dark");
    expect((t.algorithm as unknown[])[0]).toBe(antd.darkAlgorithm);
    expect(t.token?.colorPrimary).toBe(palettes.dark.accent);
    expect(t.token?.colorLink).toBe(palettes.dark.ink);
    expect(t.token?.colorBgBase).toBe(palettes.dark.desk);
    expect(t.token?.colorBgContainer).toBe(palettes.dark.tape);
    expect(t.token?.colorTextSecondary).toBe(palettes.dark.inkSoft);
    expect(t.token?.colorError).toBe(palettes.dark.ribbon);
  });
  it("uses the default algorithm and the light palette in light mode", () => {
    const t = antdTheme("light");
    expect((t.algorithm as unknown[])[0]).toBe(antd.defaultAlgorithm);
    expect(t.token?.colorText).toBe(palettes.light.ink);
  });
  it("antd paints every colour the theme sets, in both modes", () => {
    // antd treats the status colours as seeds, and the dark algorithm moves
    // them: ink #F2F1EC printed as #d1d0cc, the ribbon #FF7A7A as #dc6b6b.
    for (const mode of ["light", "dark"] as const) {
      const config = antdTheme(mode);
      const painted = antd.getDesignToken(config) as unknown as Record<string, unknown>;
      const drifted = Object.entries(config.token ?? {})
        .filter(([k, v]) => /^color/.test(k) && typeof v === "string"
          && String(painted[k]).toLowerCase() !== v.toLowerCase())
        .map(([k, v]) => `${mode} ${k}: ${v} → ${painted[k]}`);
      expect(drifted).toEqual([]);
    }
  });
  it("gives success no colour of its own: only exceptions get colour", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(antdTheme(mode).token?.colorSuccess).toBe(palettes[mode].ink);
    }
  });
});

/** Runs the boot script against stub globals, as a browser would before paint. */
function boot(choice: string, matchMedia?: (q: string) => { matches: boolean }) {
  const attrs: Record<string, string> = { "data-theme-choice": choice, "data-theme": "dark" };
  const doc = {
    cookie: "",
    documentElement: {
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
    },
  };
  const win = matchMedia ? { matchMedia } : {};
  new Function("document", "window", BOOT_SCRIPT)(doc, win);
  return { attrs, cookie: doc.cookie };
}

describe("BOOT_SCRIPT", () => {
  it("applies and records a light system preference when the choice is system", () => {
    const { attrs, cookie } = boot("system", () => ({ matches: true }));
    expect(attrs["data-theme"]).toBe("light");
    expect(cookie).toContain("theme-system=light");
  });
  it("leaves an explicit choice alone", () => {
    const { attrs, cookie } = boot("dark", () => ({ matches: true }));
    expect(attrs["data-theme"]).toBe("dark");
    expect(cookie).toBe("");
  });
  it("does nothing and throws nothing without matchMedia", () => {
    expect(() => boot("system")).not.toThrow();
    expect(boot("system").attrs["data-theme"]).toBe("dark");
  });
});

describe("themeCookie", () => {
  it("is site-wide, a year long and lax", () => {
    expect(themeCookie("theme", "light")).toBe("theme=light; path=/; max-age=31536000; samesite=lax");
  });
});

describe("antdTheme cuts paper square and prints in the right faces (spec §6.4)", () => {
  it("has no rounded corners anywhere", () => {
    const t = antdTheme("light").token!;
    for (const k of ["borderRadius", "borderRadiusLG", "borderRadiusSM", "borderRadiusXS", "borderRadiusOuter"] as const) {
      expect(t[k]).toBe(0);
    }
  });
  it("sets sentences in the sans and code in the mono", () => {
    const t = antdTheme("dark").token!;
    expect(t.fontFamily).toBe("var(--font-sans)");
    expect(t.fontFamilyCode).toBe("var(--font-mono)");
  });
  it("hovers the primary button to accentHover, which keeps its text readable", () => {
    expect(antdTheme("light").token!.colorPrimaryHover).toBe(palettes.light.accentHover);
  });
  it("prints Tag statuses by the colour rules", () => {
    const tag = antdTheme("dark").components!.Tag!;
    expect(tag.colorSuccessBg).toBe("transparent");
    expect(tag.colorWarningBg).toBe(palettes.dark.highlight);
    expect(tag.colorWarning).toBe(palettes.dark.onHighlight);
    expect(tag.colorErrorBg).toBe(palettes.dark.ribbonBg);
  });
});
