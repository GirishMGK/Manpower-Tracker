import { describe, expect, it } from "vitest";
import { formatDateRange, isUpcoming, leaveBalanceSummary } from "./meFormat";

describe("formatDateRange", () => {
  it("collapses a single-day range", () => {
    expect(formatDateRange("2026-09-08", "2026-09-08")).toBe("2026-09-08");
  });

  it("shows an arrow for a multi-day range", () => {
    expect(formatDateRange("2026-09-08", "2026-09-10")).toBe("2026-09-08 → 2026-09-10");
  });
});

describe("leaveBalanceSummary", () => {
  it("computes remaining days when an entitlement is set", () => {
    const summary = leaveBalanceSummary({
      financial_year_from: "2026-04-01", financial_year_to: "2027-03-31",
      entitlement_days: 18, approved_days_taken: 5, pending_days: 2, remaining_days: 13,
    });
    expect(summary).toBe("13 of 18 day(s) remaining this FY");
  });

  it("falls back gracefully when no entitlement is set", () => {
    const summary = leaveBalanceSummary({
      financial_year_from: "2026-04-01", financial_year_to: "2027-03-31",
      entitlement_days: null, approved_days_taken: 3, pending_days: 0, remaining_days: null,
    });
    expect(summary).toBe("3 day(s) taken this FY (no entitlement set)");
  });
});

describe("isUpcoming", () => {
  it("treats today and future dates as upcoming", () => {
    expect(isUpcoming("2026-09-08", "2026-09-08")).toBe(true);
    expect(isUpcoming("2026-09-09", "2026-09-08")).toBe(true);
  });

  it("treats past dates as not upcoming", () => {
    expect(isUpcoming("2026-09-07", "2026-09-08")).toBe(false);
  });
});
