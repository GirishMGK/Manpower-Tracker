import { useCallback, useMemo, useRef, useState } from "react";
import { addDays, daysBetween, isWeekend, today } from "@/lib/dates";
import type { BoardAllocation, BoardLeave, BoardStaff, ValidateResponse } from "@/types/scheduler";
import { colorForDepartment, violationColor } from "./colors";
import { assignLanes, dailyPctByDay, laneCount } from "./layout";

export type SchedulerRow =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "staff"; staff: BoardStaff };

type DragKind = "move" | "resize-start" | "resize-end";

type DragState = {
  kind: DragKind;
  allocation: BoardAllocation;
  startX: number;
  originalFrom: string;
  originalTo: string;
  candidateFrom: string;
  candidateTo: string;
  validation: ValidateResponse | null;
};

const LANE_HEIGHT = 26;
const GROUP_HEIGHT = 28;
const ROW_PADDING = 6;
const LABEL_WIDTH = 260;

export type ValidateCandidate = {
  staff_id: string;
  engagement_id: string;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  exclude_allocation_id?: string;
};

type Props = {
  rows: SchedulerRow[];
  windowFrom: string;
  windowTo: string;
  pxPerDay: number;
  allocationsByStaff: Map<string, BoardAllocation[]>;
  leavesByStaff: Map<string, BoardLeave[]>;
  holidayDates: Set<string>;
  selectedAllocationId: string | null;
  onToggleGroup: (key: string) => void;
  onBarSelect: (alloc: BoardAllocation) => void;
  onEmptyCellClick: (staff: BoardStaff, date: string) => void;
  onRowSelect: (staffId: string) => void;
  validateCandidate: (candidate: ValidateCandidate) => Promise<ValidateResponse>;
  onCommitMove: (alloc: BoardAllocation, newFrom: string, newTo: string) => Promise<void>;
};

export default function SchedulerGrid({
  rows, windowFrom, windowTo, pxPerDay, allocationsByStaff, leavesByStaff, holidayDates,
  selectedAllocationId, onToggleGroup, onBarSelect, onEmptyCellClick, onRowSelect,
  validateCandidate, onCommitMove,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const validateTimer = useRef<number | null>(null);

  const totalDays = daysBetween(windowFrom, windowTo) + 1;
  const width = LABEL_WIDTH + totalDays * pxPerDay;
  const dateToX = useCallback((date: string) => LABEL_WIDTH + daysBetween(windowFrom, date) * pxPerDay, [windowFrom, pxPerDay]);
  const xToDate = useCallback(
    (x: number) => addDays(windowFrom, Math.round((x - LABEL_WIDTH) / pxPerDay)),
    [windowFrom, pxPerDay],
  );

  const rowLayout = useMemo(() => {
    let y = 0;
    return rows.map((row) => {
      const rowY = y;
      let h = GROUP_HEIGHT;
      if (row.kind === "staff") {
        const allocs = allocationsByStaff.get(row.staff.id) ?? [];
        h = Math.max(1, laneCount(allocs)) * LANE_HEIGHT + ROW_PADDING;
      }
      y += h;
      return { row, y: rowY, h };
    });
  }, [rows, allocationsByStaff]);
  const totalHeight = rowLayout.length ? rowLayout[rowLayout.length - 1].y + rowLayout[rowLayout.length - 1].h : 0;

  const dayTicks = useMemo(() => {
    const ticks: string[] = [];
    for (let i = 0; i < totalDays; i++) ticks.push(addDays(windowFrom, i));
    return ticks;
  }, [windowFrom, totalDays]);

  const scheduleValidate = useCallback(
    (state: DragState) => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
      validateTimer.current = window.setTimeout(async () => {
        const result = await validateCandidate({
          staff_id: state.allocation.staff_id,
          engagement_id: state.allocation.engagement_id,
          role_on_engagement: state.allocation.role_on_engagement,
          date_from: state.candidateFrom,
          date_to: state.candidateTo,
          allocation_pct: state.allocation.allocation_pct,
          exclude_allocation_id: state.allocation.id,
        });
        if (dragRef.current && dragRef.current.allocation.id === state.allocation.id) {
          const next = { ...dragRef.current, validation: result };
          dragRef.current = next;
          setDrag(next);
        }
      }, 150);
    },
    [validateCandidate],
  );

  const onBarPointerDown = (e: React.PointerEvent, alloc: BoardAllocation, kind: DragKind) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const state: DragState = {
      kind, allocation: alloc, startX: e.clientX,
      originalFrom: alloc.date_from, originalTo: alloc.date_to,
      candidateFrom: alloc.date_from, candidateTo: alloc.date_to,
      validation: null,
    };
    dragRef.current = state;
    setDrag(state);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state) return;
    const deltaPx = e.clientX - state.startX;
    const deltaDays = Math.round(deltaPx / pxPerDay);
    if (deltaDays === 0 && state.candidateFrom === state.originalFrom && state.candidateTo === state.originalTo) return;

    let candidateFrom = state.originalFrom;
    let candidateTo = state.originalTo;
    if (state.kind === "move") {
      candidateFrom = addDays(state.originalFrom, deltaDays);
      candidateTo = addDays(state.originalTo, deltaDays);
    } else if (state.kind === "resize-start") {
      candidateFrom = addDays(state.originalFrom, deltaDays);
      if (candidateFrom > candidateTo) candidateFrom = candidateTo;
    } else if (state.kind === "resize-end") {
      candidateTo = addDays(state.originalTo, deltaDays);
      if (candidateTo < candidateFrom) candidateTo = candidateFrom;
    }
    if (candidateFrom === state.candidateFrom && candidateTo === state.candidateTo) return;

    const next = { ...state, candidateFrom, candidateTo, validation: state.validation };
    dragRef.current = next;
    setDrag(next);
    scheduleValidate(next);
  };

  const onSvgPointerUp = async () => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!state) return;
    if (state.candidateFrom === state.originalFrom && state.candidateTo === state.originalTo) {
      // No net movement — this was a click/select, not a drag. Handled here
      // (rather than a separate onClick on the bar) because a native click
      // event still fires after pointerup even when the pointer moved a lot
      // in between, so a real drag would otherwise also re-trigger select.
      if (state.kind === "move") onBarSelect(state.allocation);
      return;
    }
    await onCommitMove(state.allocation, state.candidateFrom, state.candidateTo);
  };

  const todayStr = today();

  return (
    <div className="overflow-auto border border-slate-200 rounded-lg bg-white" style={{ maxHeight: "70vh" }}>
      <svg
        ref={svgRef}
        width={width}
        height={totalHeight + 32}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        className="select-none"
      >
        <defs>
          <pattern id="leave-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f1f5f9" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="2" />
          </pattern>
          <pattern id="soft-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Header: day ticks */}
        <g>
          {dayTicks.map((d) => (
            <g key={`h-${d}`}>
              <rect
                x={dateToX(d)} y={0} width={pxPerDay} height={totalHeight + 24}
                fill={isWeekend(d) ? "#f8fafc" : holidayDates.has(d) ? "#fef2f2" : "white"}
              />
              {d === todayStr && <rect x={dateToX(d)} y={0} width={pxPerDay} height={totalHeight + 24} fill="#dbeafe" fillOpacity={0.5} />}
              <text x={dateToX(d) + pxPerDay / 2} y={16} textAnchor="middle" fontSize={10} fill="#475569">
                {parseInt(d.slice(8, 10), 10)}
              </text>
            </g>
          ))}
          <line x1={LABEL_WIDTH} y1={24} x2={width} y2={24} stroke="#cbd5e1" />
        </g>

        {/* Rows */}
        <g transform="translate(0, 24)">
          {rowLayout.map(({ row, y, h }) => {
            if (row.kind === "group") {
              return (
                <g key={row.key} onClick={() => onToggleGroup(row.key)} className="cursor-pointer">
                  <rect x={0} y={y} width={width} height={h} fill="#f1f5f9" />
                  <text x={8} y={y + h / 2 + 4} fontSize={12} fontWeight={600} fill="#334155">
                    {row.label} ({row.count})
                  </text>
                </g>
              );
            }

            const staff = row.staff;
            const allocs = allocationsByStaff.get(staff.id) ?? [];
            const leaves = leavesByStaff.get(staff.id) ?? [];
            const lanes = assignLanes(allocs);
            const pctByDay = dailyPctByDay(allocs, windowFrom, windowTo);

            return (
              <g key={staff.id}>
                <rect
                  x={0} y={y} width={LABEL_WIDTH} height={h} fill="white"
                  stroke="#f1f5f9" onClick={() => onRowSelect(staff.id)} className="cursor-pointer"
                />
                <text x={8} y={y + h / 2 + 4} fontSize={12} fill="#0f172a" onClick={() => onRowSelect(staff.id)} className="cursor-pointer">
                  {staff.full_name} · {staff.designation}
                </text>

                {/* daily utilisation heat */}
                {dayTicks.map((d) => {
                  const pct = pctByDay.get(d) ?? 0;
                  const over = pct > 100;
                  const fill = pct === 0 ? "transparent" : over ? "#fecaca" : `rgba(34,197,94,${Math.min(pct / 100, 1) * 0.25})`;
                  return (
                    <rect
                      key={`u-${staff.id}-${d}`} x={dateToX(d)} y={y} width={pxPerDay} height={h}
                      fill={fill}
                      onClick={() => onEmptyCellClick(staff, d)}
                      className="cursor-pointer"
                    />
                  );
                })}

                {/* leave bands */}
                {leaves.map((lv) => (
                  <rect
                    key={lv.id} x={dateToX(lv.date_from)} y={y}
                    width={(daysBetween(lv.date_from, lv.date_to) + 1) * pxPerDay} height={h}
                    fill="url(#leave-hatch)" opacity={0.7}
                  />
                ))}

                {/* allocation bars */}
                {allocs.map((alloc) => {
                  const lane = lanes.get(alloc.id) ?? 0;
                  const isDragging = drag?.allocation.id === alloc.id;
                  const barFrom = isDragging ? drag!.candidateFrom : alloc.date_from;
                  const barTo = isDragging ? drag!.candidateTo : alloc.date_to;
                  const barX = dateToX(barFrom);
                  const barW = Math.max(pxPerDay - 2, (daysBetween(barFrom, barTo) + 1) * pxPerDay - 2);
                  const barY = y + lane * LANE_HEIGHT + 3;
                  const isSelected = selectedAllocationId === alloc.id;
                  const severity = isDragging ? drag!.validation?.violations?.[0]?.severity ?? null : null;
                  const fill = isDragging && severity ? violationColor(severity) : colorForDepartment(alloc.department_id);

                  return (
                    <g key={alloc.id} opacity={alloc.status === "CANCELLED" ? 0.3 : 1}>
                      <rect
                        x={barX} y={barY} width={barW} height={LANE_HEIGHT - 6} rx={4}
                        fill={fill}
                        fillOpacity={alloc.booking_type === "HARD" ? 1 : 0.55}
                        stroke={isSelected ? "#0f172a" : "transparent"}
                        strokeWidth={2}
                        onPointerDown={(e) => onBarPointerDown(e, alloc, "move")}
                        className="cursor-grab"
                      />
                      {alloc.booking_type !== "HARD" && (
                        <rect x={barX} y={barY} width={barW} height={LANE_HEIGHT - 6} rx={4} fill="url(#soft-hatch)" pointerEvents="none" />
                      )}
                      {barW > 40 && (
                        <text x={barX + 6} y={barY + (LANE_HEIGHT - 6) / 2 + 4} fontSize={10} fill="white" pointerEvents="none">
                          {alloc.engagement_code} · {alloc.role_on_engagement}
                        </text>
                      )}
                      {/* resize handles */}
                      <rect
                        x={barX} y={barY} width={6} height={LANE_HEIGHT - 6} fill="transparent"
                        onPointerDown={(e) => onBarPointerDown(e, alloc, "resize-start")}
                        className="cursor-ew-resize"
                      />
                      <rect
                        x={barX + barW - 6} y={barY} width={6} height={LANE_HEIGHT - 6} fill="transparent"
                        onPointerDown={(e) => onBarPointerDown(e, alloc, "resize-end")}
                        className="cursor-ew-resize"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
