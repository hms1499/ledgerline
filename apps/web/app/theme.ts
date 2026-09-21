import type { ThemeConfig } from "antd";

/**
 * Ledger paper, not admin panel.
 *
 * Accounting paper was printed pale green — "eye-ease" stock — and auditors
 * annotated it in coloured pencil distinct from the print. That is the
 * vernacular this page belongs to, and it is why the marks are green and red
 * while the type is a green-black rather than grey.
 */
export const palette = {
  ground: "#F2F5F0",
  raised: "#FAFBF9",
  ink: "#1A2A28",
  inkSoft: "#53625F",
  rule: "#C8D4CB",
  ruleStrong: "#1A2A28",
  tick: "#0B6E4F",
  flag: "#A62639",
  pending: "#B26B00",
} as const;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: palette.tick,
    colorError: palette.flag,
    colorWarning: palette.pending,
    colorSuccess: palette.tick,
    colorText: palette.ink,
    colorTextSecondary: palette.inkSoft,
    colorBgBase: palette.ground,
    colorBgContainer: palette.raised,
    colorBorder: palette.rule,
    colorBorderSecondary: palette.rule,
    // A document has no rounded corners and casts no shadow.
    borderRadius: 0,
    boxShadow: "none",
    boxShadowSecondary: "none",
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    lineHeight: 1.6,
  },
  components: {
    Collapse: { headerPadding: "10px 0", contentPadding: "0 0 16px" },
    Alert: { withDescriptionPadding: "14px 16px" },
  },
};
