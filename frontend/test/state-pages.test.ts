import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

// Every state a route can be in has a page of its own, so a failed read, a
// lost URL or a slow stream never hands a visitor a blank browser tab.
describe("state pages (loading, error, not-found, global-error)", () => {
  it("bounds errors where they happen: a route boundary, and a global one that can stand alone", () => {
    expect(read("app/error.tsx")).toMatch(/^"use client";/m);
    expect(read("app/error.tsx")).toContain("reset");
    // Global replaces the whole root layout, so it must print its own html
    // and body, and follow its own theme without ThemeProvider.
    expect(read("app/global-error.tsx")).toMatch(/^"use client";/m);
    expect(read("app/global-error.tsx")).toMatch(/<html/);
    expect(read("app/global-error.tsx")).toContain("<body");
  });

  it("gives a missing route a static page of its own", () => {
    expect(read("app/not-found.tsx")).toContain("There is no page here");
  });

  it("marks the app group's slow load as still feeding", () => {
    expect(read("app/(app)/loading.tsx")).toContain('state="feeding"');
  });
});