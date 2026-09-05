import type { Department, Office } from "@/types/scheduler";
import type { DashboardFilters } from "@/types/dashboard";

type ClientGroupOption = { id: string; group_name: string };
type StaffOption = { id: string; full_name: string };

type Props = {
  filters: DashboardFilters;
  offices: Office[];
  departments: Department[];
  clientGroups: ClientGroupOption[];
  partners: StaffOption[];
  onChange: (f: DashboardFilters) => void;
};

const STAFF_CATEGORIES = [
  "PARTNER", "DIRECTOR", "EMPLOYEE_CA", "EMPLOYEE_OTHER_PROF", "EMPLOYEE_SEMI_QUALIFIED",
  "ARTICLED_ASSISTANT", "INDUSTRIAL_TRAINEE", "PAID_ASSISTANT", "SUPPORT_STAFF", "CONSULTANT_EXTERNAL",
];

export default function DashboardFilterBar({ filters, offices, departments, clientGroups, partners, onChange }: Props) {
  function set<K extends keyof DashboardFilters>(key: K, value: string) {
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
      <select value={filters.staffCategory} onChange={(e) => set("staffCategory", e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">All categories</option>
        {STAFF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
