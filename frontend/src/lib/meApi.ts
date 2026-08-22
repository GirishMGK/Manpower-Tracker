import { api } from "@/lib/api";
import type { MeAllocation, MeLeaveBalance, MeProfile, MeTimesheet } from "@/types/me";

export async function fetchMyProfile(): Promise<MeProfile> {
  const { data } = await api.get("/me");
  return data;
}

export async function fetchMyAllocations(dateFrom?: string, dateTo?: string): Promise<MeAllocation[]> {
  const params: Record<string, string> = {};
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get("/me/allocations", { params });
  return data;
}

export async function fetchMyLeaveBalance(): Promise<MeLeaveBalance> {
  const { data } = await api.get("/me/leave-balance");
  return data;
}

export async function fetchMyTimesheets(daysBack = 30): Promise<MeTimesheet[]> {
  const { data } = await api.get("/me/timesheets", { params: { days_back: daysBack } });
  return data;
}

export async function downloadMyCalendar() {
  const response = await api.get("/me/calendar.ics", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "my-bookings.ics");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
