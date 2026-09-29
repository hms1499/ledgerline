import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contractLine, showsSiteFooter } from "@/lib/site-footer";

describe("contractLine", () => {
  it("names the contract by its short address and links its explorer page", () => {
    expect(contractLine({ anchor: "0xd4838881EcBa8320d456B8B65A07A0ac167F0890", explorer: "https://explorer.arc.io" }))
      .toEqual({
        short: "0xd483…0890",
        href: "https://explorer.arc.io/address/0xd4838881EcBa8320d456B8B65A07A0ac167F0890",
      });
  });
  it("says nothing when this deployment has no contract configured", () => {
    expect(contractLine({ anchor: undefined, explorer: "https://explorer.arc.io" })).toBeUndefined();
  });
});

describe("showsSiteFooter", () => {
  it("ends the home page and /why", () => {
    expect(showsSiteFooter("/")).toBe(true);
    expect(showsSiteFooter("/why")).toBe(true);
  });

  it("leaves a receipt and the app pages without it", () => {
    for (const p of ["/r/0xabc", "/new", "/dashboard", "/runs", "/run/0xabc", "/whyever", null]) {
      expect(showsSiteFooter(p), String(p)).toBe(false);
    }
  });
});

describe("the footer's way to check a run without us", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("is a command anyone can run without cloning: the published arc-reconcile", () => {
    expect(read("../components/ui/SiteFooter.tsx")).toContain('const RECONCILE = "npx arc-reconcile <tx>";');
    const cli = JSON.parse(read("../../packages/cli/package.json"));
    expect(cli.name).toBe("arc-reconcile");
    expect(Object.keys(cli.bin)).toEqual(["arc-reconcile"]);
  });

  it("is the one the README leads with, for the proof run too", () => {
    const readme = read("../../README.md");
    const section = readme.slice(readme.indexOf("### Reconciling a run"), readme.indexOf("## Development"));
    expect(section.indexOf("npx arc-reconcile <txHash>")).toBeGreaterThan(-1);
    expect(readme).toContain("$ npx arc-reconcile 0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0");
  });
});
