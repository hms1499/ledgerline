import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_NAV, LEARN_NAV, activeHref, pageTitle, withNet } from "@/lib/nav";

describe("navigation", () => {
  it("lists the app's three destinations in order, then Compare", () => {
    expect(APP_NAV.map((i) => i.href)).toEqual(["/dashboard", "/new", "/runs"]);
    // /why compares a run with an ordinary batch. "How it works" named it
    // after the home page's own section, which it is not.
    expect(LEARN_NAV.map((i) => [i.href, i.label])).toEqual([["/why", "Compare"]]);
  });

  it("takes /why's label from one place, so the menus cannot drift", () => {
    for (const f of ["../components/shell/PublicShell.tsx", "../components/shell/MoreMenu.tsx"]) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
      expect(src, f).not.toMatch(/>\s*How it works\s*</);
      expect(src, f).toContain("LEARN_NAV");
    }
  });

  it("marks the right item for every route, including dynamic ones", () => {
    expect(activeHref("/dashboard")).toBe("/dashboard");
    expect(activeHref("/new")).toBe("/new");
    expect(activeHref("/runs")).toBe("/runs");
    // A single run belongs under Runs.
    expect(activeHref("/run/0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5")).toBe("/runs");
    expect(activeHref("/why")).toBe("/why");
    expect(activeHref("/")).toBeUndefined();
    // /runs must not claim /runsomething.
    expect(activeHref("/runsomething")).toBeUndefined();
  });

  it("titles each app route", () => {
    expect(pageTitle("/dashboard")).toBe("Dashboard");
    expect(pageTitle("/new")).toBe("New payout run");
    expect(pageTitle("/runs")).toBe("Your payout runs");
    expect(pageTitle("/run/0xabc")).toBe("Payout run");
  });
});

describe("withNet — shell links keep the network the payer is on", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("carries ?n= across", () => {
    expect(withNet("/runs", q("n=mainnet"))).toBe("/runs?n=mainnet");
    expect(withNet("/dashboard", q("n=testnet&x=1"))).toBe("/dashboard?n=testnet");
  });
  it("adds nothing when the page has no ?n=", () => {
    expect(withNet("/runs", q(""))).toBe("/runs");
    expect(withNet("/runs", null)).toBe("/runs");
  });
  it("encodes whatever it carries", () => {
    expect(withNet("/why", q("n=a%26b"))).toBe("/why?n=a%26b");
  });
});
