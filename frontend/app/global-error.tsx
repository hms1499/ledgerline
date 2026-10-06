"use client";

import { useEffect, useState } from "react";
import { palettes, type Mode } from "@/lib/theme-tokens";

/**
 * The last resort, which is why it is skipped first: this page replaces the
 * whole root layout when even that fails to render, so it can rely on none of
 * it — no antd, no shell CSS, no ThemeProvider, no next/font variables. It
 * prints on the light palette first, the paper default (tape spec §10), and
 * follows the device once it is mounted.
 */
export default function GlobalError({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    const m = window.matchMedia?.("(prefers-color-scheme: light)");
    setMode(m && !m.matches ? "dark" : "light");
  }, []);

  const pal = palettes[mode];
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const button: React.CSSProperties = {
    display: "inline-block",
    padding: "8px 16px",
    border: `1px solid ${pal.control}`,
    background: "transparent",
    color: pal.ink,
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  return (
    <html
      lang="en"
      data-theme={mode}
      data-theme-choice={mode}
      style={{ colorScheme: mode }}
    >
      <head>
        <title>Ledgerline could not load</title>
      </head>
      <body
        style={{
          margin: 0,
          background: pal.desk,
          color: pal.ink,
          fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 520, background: pal.tape,
            borderLeft: `3px solid ${pal.ribbon}`, padding: "28px",
            boxShadow: `0 1px 0 ${pal.rule}, 0 12px 28px -12px rgb(0 0 0 / 0.35)`,
          }}>
            <p style={{
              margin: "0 0 10px", fontFamily: mono, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              <span style={{ color: pal.ribbon }}>*** </span>Ledgerline could not
              load<span style={{ color: pal.ribbon }}> ***</span>
            </p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              The page failed before it could draw. Your runs, drafts and edits are kept
              in this browser, so nothing is lost — reloading usually fixes it.
            </p>
            <p style={{ margin: "20px 0 0" }}>
              <button type="button" onClick={() => reset()} style={button}>
                Reload the page
              </button>
            </p>
            <p style={{
              margin: "14px 0 0", fontFamily: mono, fontSize: 12,
              color: pal.inkSoft, wordBreak: "break-all",
            }}>
              {error.digest ? `Error ${error.digest}` : ""}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}