import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isWeekend, rangeOverlaps, startOfWeek } from "./dates";

describe("dates", () => {
  it("addDays / daysBetween round-trip", () => {
    expect(addDays("2026-09-01", 5)).toBe("2026-09-06");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(daysBetween("2026-09-01", "2026-09-06")).toBe(5);
  });

  it("isWeekend flags Sat/Sun only", () => {
    expect(isWeekend("2026-09-05")).toBe(true); // Saturday
    expect(isWeekend("2026-09-06")).toBe(true); // Sunday
    expect(isWeekend("2026-09-07")).toBe(false); // Monday
  });

  it("startOfWeek returns the Monday of the given date's week", () => {
    expect(startOfWeek("2026-09-10")).toBe("2026-09-07"); // Thu -> Mon
    expect(startOfWeek("2026-09-06")).toBe("2026-08-31"); // Sun -> prior Mon
  });

  it("rangeOverlaps detects overlap and non-overlap", () => {
    expect(rangeOverlaps("2026-09-01", "2026-09-10", "2026-09-10", "2026-09-15")).toBe(true);
    expect(rangeOverlaps("2026-09-01", "2026-09-10", "2026-09-11", "2026-09-15")).toBe(false);
  });
});
