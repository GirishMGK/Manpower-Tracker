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
  date_of_joining: string | null;
  date_of_exit: string | null;
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
  relationship_partner_id: string | null;
  group_id: string | null;
  is_listed: boolean;
  priority: string;
  is_mnc: boolean;
  practicing_firm: string | null;
  primary_service_type: string | null;
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

export async function updateStaff(id: string, payload: Record<string, unknown>): Promise<StaffRow> {
  const { data } = await api.patch(`/staff/${id}`, payload);
  return data;
}

/** The admin action for "employee resigned" — sets status to Left/Exited. */
export function markStaffExited(id: string, exitDate: string): Promise<StaffRow> {
  return updateStaff(id, { employment_status: "EXITED", date_of_exit: exitDate });
}

export async function fetchClientsList(q: string): Promise<ClientRow[]> {
  const { data } = await api.get("/clients", { params: { limit: 2000, q: q || undefined } });
  return data;
}

export async function createClient(payload: Record<string, unknown>): Promise<ClientRow> {
  const { data } = await api.post("/clients", payload);
  return data;
}

// ---- get-or-create resolvers ------------------------------------------
// The Masters form exposes plain, fixed choices (a city name, a partner's
// name, a group name) rather than asking the admin to first go and create
// an Office/Staff/ClientGroup master record elsewhere. These resolve a
// name to the id the API needs, creating the underlying record the first
// time that name is used — so a fresh, empty install works out of the box
// for exactly the firm's real locations/partners/groups, with nothing to
// separately "set up" first.

type Office = { id: string; code: string; name: string; city: string };

const CITY_STATE: Record<string, string> = {
  Hyderabad: "Telangana",
  Bangalore: "Karnataka",
  Mumbai: "Maharashtra",
  Chennai: "Tamil Nadu",
  Delhi: "Delhi",
};

export async function resolveOfficeIdByCity(city: string): Promise<string> {
  const { data: offices } = await api.get<Office[]>("/offices");
  const existing = offices.find((o) => o.name.toLowerCase() === city.toLowerCase() || o.city.toLowerCase() === city.toLowerCase());
  if (existing) return existing.id;
  const { data: created } = await api.post<Office>("/offices", {
    code: city.slice(0, 3).toUpperCase(),
    name: city,
    city,
    state: CITY_STATE[city] ?? city,
  });
  return created.id;
}

type StaffLite = { id: string; full_name: string; staff_category: string };

export async function resolvePartnerIdByName(fullName: string): Promise<string> {
  const { data: matches } = await api.get<StaffLite[]>("/staff", { params: { q: fullName, limit: 50 } });
  const existing = matches.find((s) => s.full_name.toLowerCase() === fullName.toLowerCase());
  if (existing) return existing.id;
  // employee_code must be globally unique; a timestamp suffix avoids
  // collisions across sessions that an in-memory counter wouldn't.
  const code = `PTR-${fullName.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const created = await createStaff({
    employee_code: code,
    full_name: fullName,
    staff_category: "PARTNER",
    designation: "PARTNER",
    grade_rank: 2,
    employment_status: "ACTIVE",
  });
  return created.id;
}

type ClientGroup = { id: string; group_code: string; group_name: string };

export async function resolveGroupIdByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: groups } = await api.get<ClientGroup[]>("/client-groups");
  const existing = groups.find((g) => g.group_name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;
  const code = `GRP-${trimmed.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || Date.now()}`;
  const { data: created } = await api.post<ClientGroup>("/client-groups", { group_code: code, group_name: trimmed });
  return created.id;
}

// ---- bulk import ---------------------------------------------------

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

export async function downloadStaffTemplate(): Promise<void> {
  const { data } = await api.get("/admin/import/staff/template", { responseType: "blob" });
  downloadBlob(data, "staff_import_template.xlsx");
}

export async function downloadClientsTemplate(): Promise<void> {
  const { data } = await api.get("/admin/import/clients/template", { responseType: "blob" });
  downloadBlob(data, "clients_import_template.xlsx");
}

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
