import { api } from "@/lib/api";
import type {
  BoardResponse,
  Department,
  EngagementLookupItem,
  Office,
  ValidateResponse,
} from "@/types/scheduler";

export async function fetchBoard(params: {
  date_from: string;
  date_to: string;
  office_id?: string;
  department_id?: string;
  q?: string;
}): Promise<BoardResponse> {
  const { data } = await api.get("/scheduler/board", { params });
  return data;
}

export async function fetchEngagementsLookup(params: { q?: string; department_id?: string }): Promise<EngagementLookupItem[]> {
  const { data } = await api.get("/scheduler/engagements-lookup", { params });
  return data;
}

export async function fetchOffices(): Promise<Office[]> {
  const { data } = await api.get("/offices");
  return data;
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data } = await api.get("/departments");
  return data;
}

export type AllocationPayload = {
  engagement_id: string;
  staff_id: string;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  status?: string;
  booking_type?: string;
  overrides?: { code: string; reason: string }[];
};

export async function validateAllocation(
  payload: AllocationPayload & { exclude_allocation_id?: string },
): Promise<ValidateResponse> {
  const { data } = await api.post("/allocations/validate", payload);
  return data;
}

export async function createAllocation(payload: AllocationPayload) {
  const { data } = await api.post("/allocations", payload);
  return data;
}

export async function updateAllocation(id: string, payload: Partial<AllocationPayload>) {
  const { data } = await api.patch(`/allocations/${id}`, payload);
  return data;
}

export async function cancelAllocation(id: string, reason?: string) {
  const { data } = await api.delete(`/allocations/${id}`, { params: { reason } });
  return data;
}
