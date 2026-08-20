import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import ReportFilterBar from "@/components/reports/ReportFilterBar";
import ReportTable from "@/components/reports/ReportTable";
import { fetchClientGroups, fetchPartners } from "@/lib/dashboardApi";
import { addDays, today } from "@/lib/dates";
import { downloadReportExport, fetchReport, fetchReportList } from "@/lib/reportsApi";
import { fetchDepartments, fetchOffices } from "@/lib/schedulerApi";
import type { ReportFilters } from "@/types/report";

function defaultFilters(): ReportFilters {
  const to = today();
  return {
    dateFrom: addDays(to, -89), dateTo: to, officeId: "", departmentId: "",
    partnerId: "", clientGroupId: "", staffCategory: "", status: "",
  };
}

export default function Reports() {
  const [selected, setSelected] = useState<string>("rp01");
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters());

  const listQuery = useQuery({ queryKey: ["report-list"], queryFn: fetchReportList, staleTime: 5 * 60_000 });
  const officesQuery = useQuery({ queryKey: ["offices"], queryFn: fetchOffices, staleTime: 5 * 60_000 });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments, staleTime: 5 * 60_000 });
  const partnersQuery = useQuery({ queryKey: ["partners"], queryFn: fetchPartners, staleTime: 5 * 60_000 });
  const clientGroupsQuery = useQuery({ queryKey: ["client-groups"], queryFn: fetchClientGroups, staleTime: 5 * 60_000 });

  const reportQuery = useQuery({
    queryKey: ["report", selected, filters],
    queryFn: () => fetchReport(selected, filters),
  });

  const reports = listQuery.data ?? [];

  return (
    <div className="flex h-screen">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Report Library</h2>
        </div>
        <nav className="p-2">
          {reports.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelected(r.key)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                selected === r.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {r.key.toUpperCase()} · {r.title}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <ReportFilterBar
          filters={filters}
          offices={officesQuery.data ?? []}
          departments={departmentsQuery.data ?? []}
          partners={partnersQuery.data ?? []}
          clientGroups={clientGroupsQuery.data ?? []}
          onChange={setFilters}
        />

        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            {reports.find((r) => r.key === selected)?.title ?? selected}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => downloadReportExport(selected, "xlsx", filters)}
              className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download size={13} /> Excel
            </button>
            <button
              onClick={() => downloadReportExport(selected, "pdf", filters)}
              className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <FileText size={13} /> PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          <ReportTable rows={reportQuery.data ?? []} loading={reportQuery.isLoading} />
        </div>
      </div>
    </div>
  );
}
