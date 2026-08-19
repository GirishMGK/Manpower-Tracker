import { api } from "@/lib/api";
import type { DashboardFilters, DrillRow } from "@/types/dashboard";

function commonParams(f: DashboardFilters, includeDates = true) {
  const p: Record<string, string> = {};
  if (includeDates) {
    p.date_from = f.dateFrom;
    p.date_to = f.dateTo;
  }
  if (f.officeId) p.office_id = f.officeId;
  if (f.departmentId) p.department_id = f.departmentId;
  if (f.partnerId) p.partner_id = f.partnerId;
  if (f.clientGroupId) p.client_group_id = f.clientGroupId;
  if (f.staffCategory) p.staff_category = f.staffCategory;
  return p;
}

export async function fetchC1(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c1-headcount", { params: f.officeId ? { office_id: f.officeId } : {} });
  return data;
}

export async function fetchC2(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c2-location-grade", { params: f.officeId ? { office_id: f.officeId } : {} });
  return data;
}

export async function fetchC3(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c3-partner-fte", { params: commonParams(f) });
  return data;
}

export async function fetchC4(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c4-partner-portfolio", { params: commonParams(f) });
  return data;
}

export async function fetchC5(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c5-department-fte", { params: commonParams(f) });
  return data;
}

export async function fetchC6(f: DashboardFilters) {
  const { data } = await api.get("/dashboards/c6-department-grade", { params: commonParams(f) });
  return data;
}

export async function fetchDrill(f: DashboardFilters, extra: Record<string, string> = {}): Promise<DrillRow[]> {
  const { data } = await api.get("/dashboards/drill", { params: { ...commonParams(f), ...extra } });
  return data;
}

export async function fetchDrillHeadcount(params: { office_id?: string; staff_category?: string; designation?: string }) {
  const { data } = await api.get("/dashboards/drill-headcount", { params });
  return data;
}

export async function fetchPartners(): Promise<{ id: string; full_name: string }[]> {
  const { data } = await api.get("/staff", { params: { staff_category: "PARTNER", limit: 500 } });
  return data;
}

export async function fetchClientGroups(): Promise<{ id: string; group_name: string }[]> {
  const { data } = await api.get("/client-groups", { params: { limit: 500 } });
  return data;
}

export async function downloadChartExport(chart: string, f: DashboardFilters) {
  const response = await api.get(`/dashboards/${chart}/export`, { params: commonParams(f), responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${chart}_export.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
