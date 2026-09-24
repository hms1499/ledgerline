import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const rule = (css: string, selector: string) =>
  css.match(new RegExp(`(^|\\n)${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))?.[2] ?? "";

describe("one frame for every page (spec §5.2)", () => {
  it("the frame holds the width, and the grid does not", () => {
    const shell = read("../app/styles/shell.css");
    expect(rule(shell, ".frame")).toContain("max-width: calc(1200px + 2 * var(--gutter))");
    expect(rule(shell, ".grid")).not.toContain("max-width");
  });

  it("both shells put the header and the page in the same frame", () => {
    expect(read("../components/shell/TopBar.tsx")).toContain('className="frame top-bar-inner"');
    expect(read("../components/shell/AppShell.tsx")).toContain('<div className="frame">{children}</div>');
    const pub = read("../components/shell/PublicShell.tsx");
    expect(pub).toContain('className="frame public-bar-inner"');
    expect(pub).toContain('<div className="frame">{children}</div>');
  });

  it("one stylesheet per responsibility, and the old single file is gone", () => {
    expect(existsSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)))).toBe(false);
    const layout = read("../app/layout.tsx");
    for (const f of ["base", "shell", "pages"]) expect(layout).toContain(`import "./styles/${f}.css";`);
  });
});
