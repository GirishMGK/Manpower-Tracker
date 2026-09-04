import { api } from "@/lib/api";

// Minimal client for the staff/client masters CRUD + §10 bulk import
// endpoints (backend/app/api/v1/staff.py, clients.py, admin_import.py).
// These endpoints existed since P1 but had no frontend page until now.

export type StaffRow = {
  id: string;
  employee_code: string;
  full_name: string;
  official_email: string | null;
  mobile: string | null;
  staff_category: string;
  designation: string;
  base_office_id: string | null;
  employment_status: string;
  is_active: boolean;
};

export type ClientRow = {
  id: string;
  client_code: string;
  name: string;
  entity_class: string;
  sector: string | null;
  relationship_status: string;
  risk_rating: string;
  is_active: boolean;
};

export type ImportSummary = {
  entity: string;
  total_rows: number;
  valid_count: number;
  error_count: number;
  errors: { row: number; field?: string; message: string }[];
  committed?: number;
  message?: string;
};

export async function fetchStaffList(q: string): Promise<StaffRow[]> {
  const { data } = await api.get("/staff", { params: { limit: 2000, q: q || undefined } });
  return data;
}

export async function createStaff(payload: Record<string, unknown>): Promise<StaffRow> {
  const { data } = await api.post("/staff", payload);
  return data;
}

export async function fetchClientsList(q: string): Promise<ClientRow[]> {
  const { data } = await api.get("/clients", { params: { limit: 2000, q: q || undefined } });
  return data;
}

export async function createClient(payload: Record<string, unknown>): Promise<ClientRow> {
  const { data } = await api.post("/clients", payload);
  return data;
}

async function postImportFile(path: string, file: File, commitValidOnly?: boolean): Promise<ImportSummary> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(path, form, {
    params: commitValidOnly === undefined ? undefined : { commit_valid_only: commitValidOnly },
  });
  return data;
}

export const validateStaffImport = (file: File) => postImportFile("/admin/import/staff/validate", file);
export const commitStaffImport = (file: File, commitValidOnly: boolean) =>
  postImportFile("/admin/import/staff/commit", file, commitValidOnly);

export const validateClientsImport = (file: File) => postImportFile("/admin/import/clients/validate", file);
export const commitClientsImport = (file: File, commitValidOnly: boolean) =>
  postImportFile("/admin/import/clients/commit", file, commitValidOnly);

export async function downloadStaffErrorWorkbook(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/admin/import/staff/validate/error-workbook", form, { responseType: "blob" });
  downloadBlob(data, "staff_import_errors.xlsx");
}

export async function downloadClientsErrorWorkbook(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/admin/import/clients/validate/error-workbook", form, { responseType: "blob" });
  downloadBlob(data, "clients_import_errors.xlsx");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
