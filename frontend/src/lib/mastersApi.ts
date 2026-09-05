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

// ---- shared firm vocabulary -----------------------------------------
// The Masters page and the Manpower Allocation tab both need the same
// fixed dropdown lists (designations, work locations, engagement/service
// types, partner names) — kept in one place so the two screens can never
// drift apart. Mirrors the backend's app.importers.friendly_values.

export const DESIGNATIONS: { label: string; designation: string; staffCategory: string; gradeRank: number }[] = [
  { label: "Partner", designation: "PARTNER", staffCategory: "PARTNER", gradeRank: 2 },
  { label: "Senior Manager", designation: "SENIOR_MANAGER", staffCategory: "EMPLOYEE_CA", gradeRank: 4 },
  { label: "Manager", designation: "MANAGER", staffCategory: "EMPLOYEE_CA", gradeRank: 5 },
  { label: "Executive", designation: "EXECUTIVE", staffCategory: "EMPLOYEE_OTHER_PROF", gradeRank: 9 },
  { label: "Article", designation: "ARTICLE_Y1", staffCategory: "ARTICLED_ASSISTANT", gradeRank: 12 },
];

export const WORK_LOCATIONS = ["Hyderabad", "Bangalore", "Mumbai", "Chennai", "Delhi"];

export const ENGAGEMENT_TYPES: { label: string; value: string }[] = [
  { label: "Statutory audit", value: "STATUTORY_AUDIT" },
  { label: "Limited review", value: "LIMITED_REVIEW" },
  { label: "Internal audit", value: "INTERNAL_AUDIT" },
  { label: "Tax audit", value: "TAX_AUDIT" },
  { label: "GST Audit", value: "GST_AUDIT" },
  { label: "ITR", value: "ITR" },
  { label: "Tax works", value: "TAX_WORKS" },
  { label: "Consultancy", value: "CONSULTANCY" },
  { label: "Opinion", value: "OPINION" },
  { label: "Others", value: "OTHER" },
];

export const PARTNERS = [
  "Srinivas Gogineni", "Hitesh Kumar P", "Ranganayakulu B", "Sudarshan Gupta MS",
  "Bhargava Anumolu", "Chandrshekar B", "Krishnamohan Reddy JS",
];

export function labelize(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export function findLabel(options: { label: string; value: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? labelize(value);
}

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

// ---- per-client engagements ---------------------------------------
// The client master's "Type of engagement" field is a single value — the
// client's *primary* service. A client actually receiving several
// services (say, Limited Review + Statutory audit + Tax audit +
// Consultancy) needs one Engagement record per service instead — that's
// the entity the scheduler board, timesheets and billing actually attach
// to, and a client can have any number of them. This is a thin client
// for the existing /engagements endpoints (no backend changes needed —
// POST /engagements already accepts everything required); it exists so
// there's a screen to use them from at all.

export type EngagementRow = {
  id: string;
  engagement_code: string;
  service_type: string;
  financial_year: string;
  status: string;
};

export async function fetchClientEngagements(clientId: string): Promise<EngagementRow[]> {
  const { data } = await api.get<EngagementRow[]>("/engagements", { params: { client_id: clientId, limit: 200 } });
  return data;
}

type Department = { id: string; code: string; name: string };

// Which department a service type falls under — auto-resolved (and
// created on first use, like Office/Staff/ClientGroup) so the admin
// never has to separately set up departments just to add an engagement.
const SERVICE_DEPARTMENT: Record<string, string> = {
  STATUTORY_AUDIT: "Audit",
  LIMITED_REVIEW: "Audit",
  INTERNAL_AUDIT: "Internal Audit",
  TAX_AUDIT: "Tax",
  GST_AUDIT: "Indirect Tax",
  ITR: "Tax",
  TAX_WORKS: "Tax",
  CONSULTANCY: "Advisory",
  OPINION: "Advisory",
  OTHER: "General",
};

const SERVICE_ABBR: Record<string, string> = {
  STATUTORY_AUDIT: "STAT",
  LIMITED_REVIEW: "LR",
  INTERNAL_AUDIT: "IA",
  TAX_AUDIT: "TAXAUD",
  GST_AUDIT: "GST",
  ITR: "ITR",
  TAX_WORKS: "TAXWORK",
  CONSULTANCY: "CONS",
  OPINION: "OPN",
  OTHER: "OTH",
};

async function resolveDepartmentIdByName(name: string): Promise<string> {
  const { data: departments } = await api.get<Department[]>("/departments");
  const existing = departments.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const { data: created } = await api.post<Department>("/departments", {
    code: name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "GEN",
    name,
  });
  return created.id;
}

/** India's April-March financial year, as the "FY2025-26" style string
 * used throughout this codebase (see seed/seed_data.py's FY_LIST). */
export function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // month 3 = April
  return `FY${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export async function addClientEngagement(clientId: string, clientCode: string, serviceType: string): Promise<EngagementRow> {
  const departmentId = await resolveDepartmentIdByName(SERVICE_DEPARTMENT[serviceType] ?? "General");
  const fy = currentFinancialYear();
  const engagementCode = `${clientCode}-${SERVICE_ABBR[serviceType] ?? serviceType.slice(0, 6)}-${fy}`;
  const { data } = await api.post<EngagementRow>("/engagements", {
    engagement_code: engagementCode,
    client_id: clientId,
    department_id: departmentId,
    service_type: serviceType,
    financial_year: fy,
  });
  return data;
}

// ---- Manpower Allocation tab ----------------------------------------
// A simpler, roster-shaped screen over the same /allocations endpoint the
// drag-drop scheduler uses: every non-partner staff member, the clients
// they're currently booked to (from a confirmed booking or an oral
// discussion), and a per-client rollup. The backend enforces the actual
// caps (R25 CONCURRENT_CLIENT_CAP: 3 clients at once for an article, 4 for
// any other non-partner staff) — this is just the screen to work from.

export type EngagementLite = {
  id: string;
  engagement_code: string;
  client_id: string;
  service_type: string;
  financial_year: string;
};

export async function fetchAllEngagements(): Promise<EngagementLite[]> {
  const { data } = await api.get<EngagementLite[]>("/engagements", { params: { limit: 5000 } });
  return data;
}

export type AllocationRow = {
  id: string;
  engagement_id: string;
  staff_id: string;
  role_on_engagement: string;
  partner_id: string | null;
  reporting_manager_id: string | null;
  date_from: string;
  date_to: string;
  booking_type: string;
  status: string;
  notes: string | null;
};

export async function fetchAllocations(): Promise<AllocationRow[]> {
  const { data } = await api.get<AllocationRow[]>("/allocations", { params: { limit: 5000 } });
  return data;
}

/** Reuses an existing engagement for this client+service if the client
 * already has one (regardless of financial year — a firm rarely runs two
 * live tax-audit engagements for the same client at once), otherwise
 * creates one, exactly like the per-client Engagements checklist. Keeps
 * "Client X / Tax audit" always landing on the same Engagement row instead
 * of spawning a duplicate every time it's picked from this tab. */
export async function resolveEngagementForBooking(clientId: string, clientCode: string, serviceType: string): Promise<EngagementRow> {
  const existing = await fetchClientEngagements(clientId);
  const match = existing.find((e) => e.service_type === serviceType);
  if (match) return match;
  return addClientEngagement(clientId, clientCode, serviceType);
}

export type CreateBookingInput = {
  staffId: string;
  isArticle: boolean;
  clientId: string;
  clientCode: string;
  serviceType: string;
  dateFrom: string;
  dateTo: string;
  bookingType: "HARD" | "SOFT";
  partnerId: string;
  managerId?: string | null;
  notes?: string;
};

/** Books one staff member onto one client for a date range — "based on
 * bookings received" (bookingType HARD) or "based on oral discussion"
 * (SOFT), per the Manpower Allocation tab's own vocabulary for
 * `allocations.booking_type`. Runs through the same full conflict-engine
 * validation as the scheduler board (R1-R25), so a BLOCK (over-cap,
 * overlapping leave, ...) surfaces as a 422 the caller should show via
 * `describeBookingError`. */
export async function createBooking(input: CreateBookingInput): Promise<AllocationRow> {
  const engagement = await resolveEngagementForBooking(input.clientId, input.clientCode, input.serviceType);
  const { data } = await api.post<AllocationRow>("/allocations", {
    engagement_id: engagement.id,
    staff_id: input.staffId,
    role_on_engagement: input.isArticle ? "ARTICLE" : "TEAM_MEMBER",
    partner_id: input.partnerId,
    reporting_manager_id: input.managerId || null,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    allocation_pct: 100,
    status: "CONFIRMED",
    booking_type: input.bookingType,
    notes: input.notes || null,
  });
  return data;
}

export async function cancelBooking(allocationId: string, reason?: string): Promise<void> {
  await api.delete(`/allocations/${allocationId}`, { params: { reason: reason || "Removed from Manpower Allocation tab" } });
}

/** BLOCK violations arrive as a 422 with `detail: {message, violations}`
 * rather than a plain string — pull out something readable for either shape. */
export function describeBookingError(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; violations?: { message: string }[] };
    if (d.violations?.length) return d.violations.map((v) => v.message).join(" ");
    if (d.message) return d.message;
  }
  return "Could not save that booking — try again.";
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
