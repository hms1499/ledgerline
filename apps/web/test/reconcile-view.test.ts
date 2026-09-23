import { describe, it, expect } from "vitest";
import { statusView } from "@/lib/reconcile-view";

describe("statusView — a row's tag on the reconciliation table", () => {
  it("does not call a payment 'not on the list' when no run file was loaded", () => {
    // Without a manifest every payment is `unexpected` by construction. A
    // warning tag on each one contradicts "Complete run" directly above it.
    const v = statusView("unexpected", false);
    expect(v.label).toBe("Paid");
    expect(v.color).not.toBe("warning");
    expect(v.note).toMatch(/load the run file/i);
  });

  it("still flags a payment the loaded manifest does not list", () => {
    const v = statusView("unexpected", true);
    expect(v.label).toBe("Not on the list");
    expect(v.color).toBe("warning");
  });

  it("leaves every other status alone without a manifest", () => {
    expect(statusView("unlinked", false).label).toBe("No payment behind reference");
    expect(statusView("unlinked", false).color).toBe("error");
  });
});
