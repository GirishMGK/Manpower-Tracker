import { rangeOverlaps } from "@/lib/dates";
import type { BoardAllocation } from "@/types/scheduler";

/** Greedy lane packing so overlapping bars (e.g. two 50% splits) stack instead of collide. */
export function assignLanes(allocations: BoardAllocation[]): Map<string, number> {
  const sorted = [...allocations].sort((a, b) => (a.date_from < b.date_from ? -1 : 1));
  const laneEnds: string[] = []; // last date_to occupied in each lane
  const laneOf = new Map<string, number>();

  for (const alloc of sorted) {
    let lane = laneEnds.findIndex((end) => end < alloc.date_from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(alloc.date_to);
    } else {
      laneEnds[lane] = alloc.date_to;
    }
    laneOf.set(alloc.id, lane);
  }
  return laneOf;
}

export function laneCount(allocations: BoardAllocation[]): number {
  if (allocations.length === 0) return 1;
  const lanes = assignLanes(allocations);
  return Math.max(1, ...Array.from(lanes.values()).map((l) => l + 1));
}

export function dailyPctByDay(allocations: BoardAllocation[], windowFrom: string, windowTo: string): Map<string, number> {
  const result = new Map<string, number>();
  let cursor = windowFrom;
  while (cursor <= windowTo) {
    const pct = allocations
      .filter((a) => rangeOverlaps(a.date_from, a.date_to, cursor, cursor))
      .reduce((sum, a) => sum + a.allocation_pct, 0);
    result.set(cursor, pct);
    const [y, m, d] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return result;
}
