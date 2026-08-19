import type { Department, Office } from "@/types/scheduler";

type Props = {
  offices: Office[];
  departments: Department[];
  officeId: string;
  departmentId: string;
  query: string;
  zoom: "day" | "week";
  windowLabel: string;
  onOfficeChange: (v: string) => void;
  onDepartmentChange: (v: string) => void;
  onQueryChange: (v: string) => void;
  onZoomChange: (v: "day" | "week") => void;
  onShiftWindow: (weeks: number) => void;
  onToday: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export default function FilterBar({
  offices, departments, officeId, departmentId, query, zoom, windowLabel,
  onOfficeChange, onDepartmentChange, onQueryChange, onZoomChange, onShiftWindow, onToday,
  onUndo, onRedo, canUndo, canRedo,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <input
        id="scheduler-search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search staff… ( / )"
        className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <select value={officeId} onChange={(e) => onOfficeChange(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All offices</option>
        {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select value={departmentId} onChange={(e) => onDepartmentChange(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      <div className="ml-auto flex items-center gap-1">
        <button onClick={() => onShiftWindow(-1)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50" title="Previous week (←)">←</button>
        <button onClick={onToday} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Today</button>
        <button onClick={() => onShiftWindow(1)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50" title="Next week (→)">→</button>
        <span className="mx-2 text-sm text-slate-500">{windowLabel}</span>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-slate-300 p-0.5">
        <button
          onClick={() => onZoomChange("day")}
          className={`rounded px-2 py-1 text-xs ${zoom === "day" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        >
          Day
        </button>
        <button
          onClick={() => onZoomChange("week")}
          className={`rounded px-2 py-1 text-xs ${zoom === "week" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        >
          Week
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button disabled={!canUndo} onClick={onUndo} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40" title="Undo (Ctrl+Z)">↶</button>
        <button disabled={!canRedo} onClick={onRedo} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40" title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>
    </div>
  );
}
