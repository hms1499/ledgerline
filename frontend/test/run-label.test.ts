import { describe, it, expect } from "vitest";
import { defaultRunLabel } from "@/lib/run-label";

describe("defaultRunLabel", () => {
  it("is this month's payroll, month padded", () => {
    expect(defaultRunLabel(new Date(2026, 8, 25))).toBe("Payroll 2026-09");
    expect(defaultRunLabel(new Date(2027, 0, 1))).toBe("Payroll 2027-01");
  });
});
