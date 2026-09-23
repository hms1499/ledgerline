import { describe, it, expect } from "vitest";
import { assessCompleteness } from "../src/completeness.js";

describe("assessCompleteness — without a manifest", () => {
  it("detects missing payments from the anchored count alone", () => {
    // The point of storing itemCount on chain: anyone with the link can tell
    // that payments are missing, with no manifest and no trust in the payer.
    const c = assessCompleteness({ anchoredItemCount: 5, paymentsFound: 3 });
    expect(c.verdict).toBe("incomplete");
    expect(c.missing).toBe(2);
  });

  it("confirms completeness when the counts agree", () => {
    const c = assessCompleteness({ anchoredItemCount: 3, paymentsFound: 3 });
    expect(c.verdict).toBe("complete");
    expect(c.missing).toBe(0);
  });

  it("flags payments beyond what was anchored", () => {
    const c = assessCompleteness({ anchoredItemCount: 2, paymentsFound: 3 });
    expect(c.verdict).toBe("over");
    expect(c.surplus).toBe(1);
  });

  it("cannot conclude anything when no run was anchored", () => {
    const c = assessCompleteness({ anchoredItemCount: undefined, paymentsFound: 3 });
    expect(c.verdict).toBe("unknown");
    expect(c.note).toMatch(/no recorded list/i);
  });

  it("treats a zero anchored count as no anchor, not as a complete empty run", () => {
    expect(assessCompleteness({ anchoredItemCount: 0, paymentsFound: 0 }).verdict).toBe("unknown");
  });

  it("counts unlinked references as not-yet-paid, never as paid", () => {
    // A reference with no transfer behind it must not fill a slot.
    const c = assessCompleteness({ anchoredItemCount: 3, paymentsFound: 2, unlinkedCount: 1 });
    expect(c.verdict).toBe("incomplete");
    expect(c.missing).toBe(1);
    // Asserted on meaning, not on our internal status name: this string is
    // shown to a recipient, and "unlinked" is vocabulary from the codebase.
    expect(c.note).toMatch(/no payment behind/i);
    expect(c.note).toMatch(/do(es)? not count as paid/i);
  });
});
