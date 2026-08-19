import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingForm, { type BookingFormValues } from "@/components/scheduler/BookingForm";
import FilterBar from "@/components/scheduler/FilterBar";
import SchedulerGrid, { type SchedulerRow } from "@/components/scheduler/SchedulerGrid";
import { addDays, startOfWeek, today } from "@/lib/dates";
import {
  cancelAllocation,
  createAllocation,
  fetchBoard,
  fetchDepartments,
  fetchOffices,
  updateAllocation,
  validateAllocation,
} from "@/lib/schedulerApi";
import { useUndoStore } from "@/lib/undoStack";
import type { BoardAllocation, BoardLeave, BoardStaff } from "@/types/scheduler";

const WINDOW_DAYS = 56; // 8 weeks, per §6.1 default

type ModalState =
  | { mode: "create"; staff: BoardStaff; initial: BookingFormValues }
  | { mode: "edit"; staff: BoardStaff; initial: BookingFormValues; allocation: BoardAllocation }
  | null;

export default function Scheduler() {
  const queryClient = useQueryClient();
  const [windowFrom, setWindowFrom] = useState(() => startOfWeek(today()));
  const [officeId, setOfficeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState<"day" | "week">("day");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { undo, redo, push, past, future } = useUndoStore();

  const windowTo = addDays(windowFrom, WINDOW_DAYS - 1);
  const pxPerDay = zoom === "day" ? 32 : 12;

  const officesQuery = useQuery({ queryKey: ["offices"], queryFn: fetchOffices, staleTime: 5 * 60_000 });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments, staleTime: 5 * 60_000 });
  const boardQuery = useQuery({
    queryKey: ["board", windowFrom, windowTo, officeId, departmentId, query],
    queryFn: () => fetchBoard({ date_from: windowFrom, date_to: windowTo, office_id: officeId || undefined, department_id: departmentId || undefined, q: query || undefined }),
  });

  const offices = officesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const board = boardQuery.data;

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["board"] }), [queryClient]);

  const allocationsByStaff = useMemo(() => {
    const map = new Map<string, BoardAllocation[]>();
    for (const a of board?.allocations ?? []) {
      if (a.status === "CANCELLED") continue;
      if (!map.has(a.staff_id)) map.set(a.staff_id, []);
      map.get(a.staff_id)!.push(a);
    }
    return map;
  }, [board]);

  const leavesByStaff = useMemo(() => {
    const map = new Map<string, BoardLeave[]>();
    for (const l of board?.leaves ?? []) {
      if (l.status !== "APPROVED") continue;
      if (!map.has(l.staff_id)) map.set(l.staff_id, []);
      map.get(l.staff_id)!.push(l);
    }
    return map;
  }, [board]);

  const holidayDates = useMemo(() => new Set((board?.holidays ?? []).map((h) => h.holiday_date)), [board]);

  const officeMap = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const rows: SchedulerRow[] = useMemo(() => {
    if (!board) return [];
    const groups = new Map<string, BoardStaff[]>();
    for (const s of board.staff) {
      const key = `${s.base_office_id ?? "none"}::${s.primary_department_id ?? "none"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const out: SchedulerRow[] = [];
    for (const [key, staffList] of groups) {
      const [officeKey, deptKey] = key.split("::");
      const label = `${officeMap.get(officeKey) ?? "Unassigned office"} / ${deptMap.get(deptKey) ?? "Unassigned dept"}`;
      out.push({ kind: "group", key, label, count: staffList.length });
      if (!collapsed.has(key)) {
        for (const s of staffList) out.push({ kind: "staff", staff: s });
      }
    }
    return out;
  }, [board, officeMap, deptMap, collapsed]);

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openCreate(staff: BoardStaff, date: string) {
    setModal({
      mode: "create",
      staff,
      initial: {
        engagement_id: "", engagement_label: "", role_on_engagement: "TEAM_MEMBER",
        date_from: date, date_to: addDays(date, 6), allocation_pct: 100,
        status: "CONFIRMED", booking_type: "HARD",
      },
    });
  }

  function openEdit(alloc: BoardAllocation) {
    setSelectedAllocationId(alloc.id);
    const staff = board?.staff.find((s) => s.id === alloc.staff_id);
    if (!staff) return;
    setModal({
      mode: "edit",
      staff,
      allocation: alloc,
      initial: {
        engagement_id: alloc.engagement_id, engagement_label: `${alloc.client_name} — ${alloc.engagement_code}`,
        role_on_engagement: alloc.role_on_engagement, date_from: alloc.date_from, date_to: alloc.date_to,
        allocation_pct: alloc.allocation_pct, status: alloc.status, booking_type: alloc.booking_type,
      },
    });
  }

  async function handleSaveModal(values: BookingFormValues, overrides: { code: string; reason: string }[]) {
    if (!modal) return;
    const payload = {
      engagement_id: values.engagement_id, staff_id: modal.staff.id, role_on_engagement: values.role_on_engagement,
      date_from: values.date_from, date_to: values.date_to, allocation_pct: values.allocation_pct,
      status: values.status, booking_type: values.booking_type, overrides,
    };
    if (modal.mode === "create") {
      const created = await createAllocation(payload);
      push({
        label: `Book ${modal.staff.full_name}`,
        undo: async () => { await cancelAllocation(created.id, "Undo"); refresh(); },
        redo: async () => { await createAllocation(payload); refresh(); },
      });
    } else {
      await updateAllocation(modal.allocation.id, payload);
      push({
        label: `Edit booking for ${modal.staff.full_name}`,
        undo: async () => { await updateAllocation(modal.allocation.id, { date_from: modal.allocation.date_from, date_to: modal.allocation.date_to, allocation_pct: modal.allocation.allocation_pct, role_on_engagement: modal.allocation.role_on_engagement }); refresh(); },
        redo: async () => { await updateAllocation(modal.allocation.id, payload); refresh(); },
      });
    }
    setModal(null);
    refresh();
  }

  async function handleCancelModal(reason: string) {
    if (!modal || modal.mode !== "edit") return;
    await cancelAllocation(modal.allocation.id, reason);
    setModal(null);
    setSelectedAllocationId(null);
    refresh();
  }

  const handleValidateCandidate = useCallback(async (candidate: Parameters<typeof validateAllocation>[0]) => validateAllocation(candidate), []);

  const handleCommitMove = useCallback(
    async (alloc: BoardAllocation, newFrom: string, newTo: string) => {
      const result = await validateAllocation({
        staff_id: alloc.staff_id, engagement_id: alloc.engagement_id, role_on_engagement: alloc.role_on_engagement,
        date_from: newFrom, date_to: newTo, allocation_pct: alloc.allocation_pct, exclude_allocation_id: alloc.id,
      });
      const blocking = result.violations.filter((v) => v.severity === "BLOCK");
      if (blocking.length > 0) {
        setToast(`Move blocked: ${blocking[0].message}`);
        setTimeout(() => setToast(null), 4000);
        return;
      }
      if (result.violations.length > 0) {
        // Needs an override reason — open the edit modal with the candidate dates rather than
        // silently committing or silently discarding.
        const staff = board?.staff.find((s) => s.id === alloc.staff_id);
        if (staff) {
          setModal({
            mode: "edit", staff, allocation: alloc,
            initial: {
              engagement_id: alloc.engagement_id, engagement_label: `${alloc.client_name} — ${alloc.engagement_code}`,
              role_on_engagement: alloc.role_on_engagement, date_from: newFrom, date_to: newTo,
              allocation_pct: alloc.allocation_pct, status: alloc.status, booking_type: alloc.booking_type,
            },
          });
        }
        return;
      }
      await updateAllocation(alloc.id, { date_from: newFrom, date_to: newTo });
      push({
        label: `Move booking`,
        undo: async () => { await updateAllocation(alloc.id, { date_from: alloc.date_from, date_to: alloc.date_to }); refresh(); },
        redo: async () => { await updateAllocation(alloc.id, { date_from: newFrom, date_to: newTo }); refresh(); },
      });
      refresh();
    },
    [board, push, refresh],
  );

  // Keyboard shortcuts (§6.1): n new booking, del cancel, ←/→ shift week, / search
  const stateRef = useRef({ selectedAllocationId, selectedStaffId, board, windowFrom });
  stateRef.current = { selectedAllocationId, selectedStaffId, board, windowFrom };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo().then((label) => label && showUndoToast(`Redid: ${label}`));
        else undo().then((label) => label && showUndoToast(`Undid: ${label}`));
        return;
      }
      if (typing) return;
      const { selectedStaffId: sid, board: b, windowFrom: wf } = stateRef.current;
      if (e.key === "n" && sid && b) {
        const staff = b.staff.find((s) => s.id === sid);
        if (staff) openCreate(staff, wf);
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("scheduler-search")?.focus();
      } else if (e.key === "ArrowLeft") {
        setWindowFrom((w) => addDays(w, -7));
      } else if (e.key === "ArrowRight") {
        setWindowFrom((w) => addDays(w, 7));
      }
    }
    function showUndoToast(msg: string) {
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
      refresh();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, refresh]);

  const windowLabel = `${windowFrom} → ${windowTo}`;

  return (
    <div className="flex h-screen flex-col">
      <FilterBar
        offices={offices} departments={departments} officeId={officeId} departmentId={departmentId}
        query={query} zoom={zoom} windowLabel={windowLabel}
        onOfficeChange={setOfficeId} onDepartmentChange={setDepartmentId} onQueryChange={setQuery}
        onZoomChange={setZoom} onShiftWindow={(weeks) => setWindowFrom((w) => addDays(w, weeks * 7))}
        onToday={() => setWindowFrom(startOfWeek(today()))}
        onUndo={() => undo()} onRedo={() => redo()} canUndo={past.length > 0} canRedo={future.length > 0}
      />

      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}

      <div className="flex-1 overflow-hidden p-4">
        {boardQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading schedule…</p>
        ) : (
          <SchedulerGrid
            rows={rows}
            windowFrom={windowFrom}
            windowTo={windowTo}
            pxPerDay={pxPerDay}
            allocationsByStaff={allocationsByStaff}
            leavesByStaff={leavesByStaff}
            holidayDates={holidayDates}
            selectedAllocationId={selectedAllocationId}
            onToggleGroup={toggleGroup}
            onBarSelect={openEdit}
            onEmptyCellClick={openCreate}
            onRowSelect={setSelectedStaffId}
            validateCandidate={handleValidateCandidate}
            onCommitMove={handleCommitMove}
          />
        )}
      </div>

      {modal && (
        <BookingForm
          staffId={modal.staff.id}
          staffLabel={`${modal.staff.full_name} · ${modal.staff.designation}`}
          initial={modal.initial}
          existingAllocation={modal.mode === "edit" ? modal.allocation : undefined}
          onClose={() => setModal(null)}
          onSave={handleSaveModal}
          onCancelBooking={modal.mode === "edit" ? handleCancelModal : undefined}
        />
      )}
    </div>
  );
}
