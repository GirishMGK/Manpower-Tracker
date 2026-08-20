import type { Department, Office } from "@/types/scheduler";
import type { ReportFilters } from "@/types/report";

type ClientGroupOption = { id: string; group_name: string };
type StaffOption = { id: string; full_name: string };

type Props = {
  filters: ReportFilters;
  offices: Office[];
  departments: Department[];
  clientGroups: ClientGroupOption[];
  partners: StaffOption[];
  onChange: (f: ReportFilters) => void;
};

const STATUSES = ["PIPELINE", "WON", "PLANNING", "FIELDWORK", "REVIEW", "REPORTING", "COMPLETED", "ON_HOLD", "LOST"];

export default function ReportFilterBar({ filters, offices, departments, clientGroups, partners, onChange }: Props) {
  function set<K extends keyof ReportFilters>(key: K, value: string) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1 text-sm">
        <input type="date" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <span className="text-slate-400">to</span>
        <input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <select value={filters.officeId} onChange={(e) => set("officeId", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All offices</option>
        {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select value={filters.departmentId} onChange={(e) => set("departmentId", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select value={filters.partnerId} onChange={(e) => set("partnerId", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All partners</option>
        {partners.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <select value={filters.clientGroupId} onChange={(e) => set("clientGroupId", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All client groups</option>
        {clientGroups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
      </select>
      <select value={filters.status} onChange={(e) => set("status", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">Any status</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
