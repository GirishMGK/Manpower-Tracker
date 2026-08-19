import { describe, expect, it } from "vitest";
import { assignLanes, dailyPctByDay, laneCount } from "./layout";
import type { BoardAllocation } from "@/types/scheduler";

function alloc(id: string, from: string, to: string, pct = 100): BoardAllocation {
  return {
    id, staff_id: "s1", engagement_id: "e1", engagement_code: "ENG", client_name: "Client",
    department_id: null, role_on_engagement: "TEAM_MEMBER", date_from: from, date_to: to,
    allocation_pct: pct, status: "CONFIRMED", booking_type: "HARD", version: 1,
  };
}

describe("scheduler layout", () => {
  it("packs non-overlapping allocations into a single lane", () => {
    const allocs = [alloc("a", "2026-09-01", "2026-09-05"), alloc("b", "2026-09-06", "2026-09-10")];
    expect(laneCount(allocs)).toBe(1);
  });

  it("stacks overlapping allocations into separate lanes (two 50% splits)", () => {
    const allocs = [alloc("a", "2026-09-01", "2026-09-10", 50), alloc("b", "2026-09-01", "2026-09-10", 50)];
    const lanes = assignLanes(allocs);
    expect(new Set(lanes.values()).size).toBe(2);
    expect(laneCount(allocs)).toBe(2);
  });

  it("dailyPctByDay sums overlapping allocations per day (T2-style 50+50=100)", () => {
    const allocs = [alloc("a", "2026-09-01", "2026-09-10", 50), alloc("b", "2026-09-01", "2026-09-10", 50)];
    const byDay = dailyPctByDay(allocs, "2026-09-01", "2026-09-10");
    expect(byDay.get("2026-09-05")).toBe(100);
  });

  it("dailyPctByDay flags overallocation above 100", () => {
    const allocs = [alloc("a", "2026-09-01", "2026-09-10", 100), alloc("b", "2026-09-05", "2026-09-08", 50)];
    const byDay = dailyPctByDay(allocs, "2026-09-01", "2026-09-10");
    expect(byDay.get("2026-09-06")).toBe(150);
    expect(byDay.get("2026-09-01")).toBe(100);
  });
});
