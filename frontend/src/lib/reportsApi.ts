import { api } from "@/lib/api";
import type { ReportFilters, ReportListItem, ReportRow } from "@/types/report";

function params(f: ReportFilters) {
  const p: Record<string, string> = { date_from: f.dateFrom, date_to: f.dateTo };
  if (f.officeId) p.office_id = f.officeId;
  if (f.departmentId) p.department_id = f.departmentId;
  if (f.partnerId) p.partner_id = f.partnerId;
  if (f.clientGroupId) p.client_group_id = f.clientGroupId;
  if (f.staffCategory) p.staff_category = f.staffCategory;
  if (f.status) p.status = f.status;
  return p;
}

export async function fetchReportList(): Promise<ReportListItem[]> {
  const { data } = await api.get("/reports");
  return data;
}

export async function fetchReport(key: string, f: ReportFilters): Promise<ReportRow[]> {
  const { data } = await api.get(`/reports/${key}`, { params: params(f) });
  return data;
}

export async function downloadReportExport(key: string, format: "xlsx" | "pdf", f: ReportFilters) {
  const response = await api.get(`/reports/${key}/export.${format}`, { params: params(f), responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${key}.${format}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
