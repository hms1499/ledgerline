import { describe, it, expect } from "vitest";
import { APP_NAV, LEARN_NAV, activeHref, pageTitle } from "@/lib/nav";

describe("navigation", () => {
  it("lists the app's three destinations in order, then How it works", () => {
    expect(APP_NAV.map((i) => i.href)).toEqual(["/dashboard", "/new", "/runs"]);
    expect(LEARN_NAV.map((i) => i.href)).toEqual(["/why"]);
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
