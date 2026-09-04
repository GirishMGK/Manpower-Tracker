import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { today } from "@/lib/dates";
import {
  type ClientRow,
  type ImportSummary,
  type StaffRow,
  commitClientsImport,
  commitStaffImport,
  createClient,
  createStaff,
  downloadClientsErrorWorkbook,
  downloadClientsTemplate,
  downloadStaffErrorWorkbook,
  downloadStaffTemplate,
  fetchClientsList,
  fetchStaffList,
  markStaffExited,
  resolveGroupIdByName,
  resolveOfficeIdByCity,
  resolvePartnerIdByName,
  validateClientsImport,
  validateStaffImport,
} from "@/lib/mastersApi";

// Every dropdown below is the firm's own fixed list, mapped onto the
// broader backend enums (app/models/enums.py) — the backend keeps its
// full vocabulary (other tooling/reports rely on it), this page just
// exposes the subset that matches how this firm actually works.

const DESIGNATIONS: { label: string; designation: string; staffCategory: string; gradeRank: number }[] = [
  { label: "Partner", designation: "PARTNER", staffCategory: "PARTNER", gradeRank: 2 },
  { label: "Senior Manager", designation: "SENIOR_MANAGER", staffCategory: "EMPLOYEE_CA", gradeRank: 4 },
  { label: "Manager", designation: "MANAGER", staffCategory: "EMPLOYEE_CA", gradeRank: 5 },
  { label: "Executive", designation: "EXECUTIVE", staffCategory: "EMPLOYEE_OTHER_PROF", gradeRank: 9 },
  { label: "Article", designation: "ARTICLE_Y1", staffCategory: "ARTICLED_ASSISTANT", gradeRank: 12 },
];

const STAFF_STATUSES = [
  { label: "Active", value: "ACTIVE" },
  { label: "Left", value: "EXITED" },
];

const WORK_LOCATIONS = ["Hyderabad", "Bangalore", "Mumbai", "Chennai", "Delhi"];

const NATURE_OPTIONS: { label: string; value: string }[] = [
  { label: "Private", value: "PRIVATE" },
  { label: "Public", value: "UNLISTED_PUBLIC" },
  { label: "LLP", value: "LLP" },
  { label: "Section 8", value: "SECTION_8" },
  { label: "NBFC", value: "NBFC" },
  { label: "Banking", value: "BANK" },
  { label: "Insurance", value: "INSURANCE" },
  { label: "Trust", value: "TRUST" },
  { label: "Co-operative society", value: "COOPERATIVE_SOCIETY" },
  { label: "Sole proprietorship", value: "SOLE_PROPRIETORSHIP" },
  { label: "Partnership", value: "PARTNERSHIP_FIRM" },
  { label: "Others", value: "OTHERS" },
];

const ENGAGEMENT_TYPES: { label: string; value: string }[] = [
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

const CLIENT_STATUSES = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const PARTNERS = [
  "Srinivas Gogineni", "Hitesh Kumar P", "Ranganayakulu B", "Sudarshan Gupta MS",
  "Bhargava Anumolu", "Chandrshekar B", "Krishnamohan Reddy JS",
];

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const FIRMS = ["BCO", "KSR"];

function labelize(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function findLabel(options: { label: string; value: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? labelize(value);
}

export default function Masters() {
  const [tab, setTab] = useState<"staff" | "clients">("staff");

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Staff &amp; clients</h1>
          <p className="mt-1 text-sm text-slate-500">Add records one at a time, or import a spreadsheet in bulk.</p>
        </div>
        <div className="flex rounded-md border border-slate-300 bg-white p-1">
          <button
            className={`rounded px-4 py-1.5 text-sm font-medium ${tab === "staff" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            onClick={() => setTab("staff")}
          >
            Staff
          </button>
          <button
            className={`rounded px-4 py-1.5 text-sm font-medium ${tab === "clients" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            onClick={() => setTab("clients")}
          >
            Clients
          </button>
        </div>
      </div>

      {tab === "staff" ? <StaffPanel /> : <ClientsPanel />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function ImportPanel({
  entityLabel,
  onDownloadTemplate,
  onValidate,
  onCommit,
  onDownloadErrors,
  onImported,
}: {
  entityLabel: string;
  onDownloadTemplate: () => Promise<void>;
  onValidate: (file: File) => Promise<ImportSummary>;
  onCommit: (file: File, commitValidOnly: boolean) => Promise<ImportSummary>;
  onDownloadErrors: (file: File) => Promise<void>;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState<"validate" | "commit" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDownloadTemplate() {
    setBusy("template");
    setError(null);
    try {
      await onDownloadTemplate();
    } catch {
      setError("Could not download the template — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function runValidate() {
    if (!file) return;
    setBusy("validate");
    setError(null);
    try {
      setSummary(await onValidate(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runCommit(commitValidOnly: boolean) {
    if (!file) return;
    setBusy("commit");
    setError(null);
    try {
      const result = await onCommit(file, commitValidOnly);
      setSummary(result);
      if ((result.committed ?? 0) > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={`Import ${entityLabel} from Excel`}>
      <p className="mb-3 text-sm text-slate-600">
        Don't have a file yet? Download the blank template below, fill it in (it already has the right columns
        and dropdown choices), then upload it here. Nothing is saved until you click Commit — Validate first is a
        dry run that just checks the file. Re-importing the same code updates that record instead of duplicating it.
      </p>
      <button
        disabled={busy !== null}
        onClick={runDownloadTemplate}
        className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
      >
        <Download size={14} /> {busy === "template" ? "Downloading…" : `Download ${entityLabel} template (.xlsx)`}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSummary(null);
            setError(null);
          }}
          className="text-sm"
        />
        <button
          disabled={!file || busy !== null}
          onClick={runValidate}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          <Upload size={14} /> {busy === "validate" ? "Validating…" : "Validate"}
        </button>
        <button
          disabled={!file || busy !== null || !summary}
          onClick={() => runCommit(false)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {busy === "commit" ? "Committing…" : "Commit all"}
        </button>
        {summary && summary.error_count > 0 && (
          <button
            disabled={busy !== null}
            onClick={() => runCommit(true)}
            className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          >
            Commit valid rows only ({summary.valid_count})
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {summary && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p>
            <strong>{summary.total_rows}</strong> rows read — <strong className="text-emerald-700">{summary.valid_count} valid</strong>,{" "}
            <strong className={summary.error_count > 0 ? "text-red-600" : ""}>{summary.error_count} with errors</strong>
            {summary.committed !== undefined && (
              <>
                {" "}
                — <strong className="text-blue-700">{summary.committed} committed</strong>
              </>
            )}
          </p>
          {summary.message && <p className="mt-1 text-slate-600">{summary.message}</p>}
          {summary.error_count > 0 && (
            <>
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {summary.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>
                    Row {err.row}{err.field ? ` · ${err.field}` : ""}: {err.message}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => file && onDownloadErrors(file)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline hover:text-slate-900"
              >
                <Download size={14} /> Download full error report (.xlsx)
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Staff

function StaffPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const listQuery = useQuery({ queryKey: ["masters-staff", q], queryFn: () => fetchStaffList(q) });
  const officesQuery = useQuery({
    queryKey: ["offices"],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>("/offices")).data,
    staleTime: 5 * 60_000,
  });
  const officeNameById = new Map((officesQuery.data ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <Card title={`Staff (${listQuery.data?.length ?? "…"})`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or employee code…"
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <UserPlus size={14} /> Add staff
          </button>
        </div>

        {showAdd && (
          <StaffAddForm
            onDone={() => {
              setShowAdd(false);
              qc.invalidateQueries({ queryKey: ["masters-staff"] });
              qc.invalidateQueries({ queryKey: ["offices"] });
            }}
          />
        )}

        <StaffTable
          rows={listQuery.data ?? []}
          loading={listQuery.isLoading}
          officeNameById={officeNameById}
          onExited={() => qc.invalidateQueries({ queryKey: ["masters-staff"] })}
        />
      </Card>

      <ImportPanel
        entityLabel="staff"
        onDownloadTemplate={downloadStaffTemplate}
        onValidate={validateStaffImport}
        onCommit={commitStaffImport}
        onDownloadErrors={downloadStaffErrorWorkbook}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["masters-staff"] });
          qc.invalidateQueries({ queryKey: ["offices"] });
        }}
      />
    </div>
  );
}

function StaffTable({
  rows,
  loading,
  officeNameById,
  onExited,
}: {
  rows: StaffRow[];
  loading: boolean;
  officeNameById: Map<string, string>;
  onExited: () => void;
}) {
  const [exiting, setExiting] = useState<string | null>(null);

  async function handleMarkExited(row: StaffRow) {
    if (!confirm(`Mark ${row.full_name} as Left (resigned/exited) as of today?`)) return;
    setExiting(row.id);
    try {
      await markStaffExited(row.id, today());
      onExited();
    } finally {
      setExiting(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No staff yet — add one above or import a spreadsheet.</p>;
  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Designation</th>
            <th className="px-3 py-2">Work location</th>
            <th className="px-3 py-2">Date of joining</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isLeft = r.employment_status === "EXITED";
            return (
              <tr key={r.id} className={isLeft ? "opacity-50" : ""}>
                <td className="px-3 py-1.5 font-mono text-xs">{r.employee_code}</td>
                <td className="px-3 py-1.5">{r.full_name}</td>
                <td className="px-3 py-1.5">{labelize(r.designation)}</td>
                <td className="px-3 py-1.5">{r.base_office_id ? (officeNameById.get(r.base_office_id) ?? "—") : "—"}</td>
                <td className="px-3 py-1.5">{r.date_of_joining ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <span className={isLeft ? "text-slate-500" : "text-emerald-700"}>{isLeft ? "Left" : "Active"}</span>
                </td>
                <td className="px-3 py-1.5">
                  {!isLeft && (
                    <button
                      title="Mark as exited"
                      disabled={exiting === r.id}
                      onClick={() => handleMarkExited(r)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <UserX size={12} /> {exiting === r.id ? "…" : "Mark exited"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StaffAddForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    designationLabel: DESIGNATIONS[0].label,
    status: "ACTIVE",
    workLocation: WORK_LOCATIONS[0],
    date_of_joining: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const d = DESIGNATIONS.find((x) => x.label === form.designationLabel) ?? DESIGNATIONS[0];
      const officeId = await resolveOfficeIdByCity(form.workLocation);
      await createStaff({
        employee_code: form.employee_code,
        full_name: form.full_name,
        staff_category: d.staffCategory,
        designation: d.designation,
        grade_rank: d.gradeRank,
        employment_status: form.status,
        base_office_id: officeId,
        current_office_id: officeId,
        date_of_joining: form.date_of_joining || null,
        date_of_exit: form.status === "EXITED" ? today() : null,
      });
      onDone();
    } catch (e2) {
      const detail = (e2 as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Could not save — check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">
        Employee code *
        <input required value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Name *
        <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Designation *
        <select required value={form.designationLabel} onChange={(e) => setForm({ ...form, designationLabel: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {DESIGNATIONS.map((d) => <option key={d.label} value={d.label}>{d.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Work location *
        <select required value={form.workLocation} onChange={(e) => setForm({ ...form, workLocation: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {WORK_LOCATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Date of joining
        <input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Status *
        <select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {STAFF_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <div className="col-span-full flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {saving ? "Saving…" : "Save staff"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}

// -------------------------------------------------------------- Clients

function ClientsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const listQuery = useQuery({ queryKey: ["masters-clients", q], queryFn: () => fetchClientsList(q) });
  const partnersQuery = useQuery({
    queryKey: ["partners-lookup"],
    queryFn: async () => (await api.get<{ id: string; full_name: string }[]>("/staff", { params: { staff_category: "PARTNER", limit: 500 } })).data,
    staleTime: 5 * 60_000,
  });
  const partnerNameById = new Map((partnersQuery.data ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <Card title={`Clients (${listQuery.data?.length ?? "…"})`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or client code…"
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <UserPlus size={14} /> Add client
          </button>
        </div>

        {showAdd && (
          <ClientAddForm
            onDone={() => {
              setShowAdd(false);
              qc.invalidateQueries({ queryKey: ["masters-clients"] });
              qc.invalidateQueries({ queryKey: ["partners-lookup"] });
            }}
          />
        )}

        <ClientsTable rows={listQuery.data ?? []} loading={listQuery.isLoading} partnerNameById={partnerNameById} />
      </Card>

      <ImportPanel
        entityLabel="clients"
        onDownloadTemplate={downloadClientsTemplate}
        onValidate={validateClientsImport}
        onCommit={commitClientsImport}
        onDownloadErrors={downloadClientsErrorWorkbook}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["masters-clients"] });
          qc.invalidateQueries({ queryKey: ["partners-lookup"] });
        }}
      />
    </div>
  );
}

function ClientsTable({
  rows,
  loading,
  partnerNameById,
}: {
  rows: ClientRow[];
  loading: boolean;
  partnerNameById: Map<string, string>;
}) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No clients yet — add one above or import a spreadsheet.</p>;
  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Entity type</th>
            <th className="px-3 py-2">Nature</th>
            <th className="px-3 py-2">Engagement</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Partner</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">MNC</th>
            <th className="px-3 py-2">Firm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
              <td className="px-3 py-1.5 font-mono text-xs">{r.client_code}</td>
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5">{r.is_listed ? "Listed" : "Non-Listed"}</td>
              <td className="px-3 py-1.5">{findLabel(NATURE_OPTIONS, r.entity_class)}</td>
              <td className="px-3 py-1.5">{r.primary_service_type ? findLabel(ENGAGEMENT_TYPES, r.primary_service_type) : "—"}</td>
              <td className="px-3 py-1.5">{r.relationship_status === "ACTIVE" ? "Active" : r.relationship_status === "INACTIVE" ? "Inactive" : labelize(r.relationship_status)}</td>
              <td className="px-3 py-1.5">{r.relationship_partner_id ? (partnerNameById.get(r.relationship_partner_id) ?? "—") : "—"}</td>
              <td className="px-3 py-1.5">{labelize(r.priority)}</td>
              <td className="px-3 py-1.5">{r.is_mnc ? "Yes" : "No"}</td>
              <td className="px-3 py-1.5">{r.practicing_firm ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientAddForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    client_code: "",
    name: "",
    isListed: "false",
    nature: NATURE_OPTIONS[0].value,
    engagementType: ENGAGEMENT_TYPES[0].value,
    status: "ACTIVE",
    partner: PARTNERS[0],
    priority: "MEDIUM",
    isMnc: "false",
    group: "",
    firm: FIRMS[0],
    natureOfBusiness: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const [partnerId, groupId] = await Promise.all([
        resolvePartnerIdByName(form.partner),
        resolveGroupIdByName(form.group),
      ]);
      await createClient({
        client_code: form.client_code,
        name: form.name,
        is_listed: form.isListed === "true",
        entity_class: form.nature,
        primary_service_type: form.engagementType,
        relationship_status: form.status,
        relationship_partner_id: partnerId,
        priority: form.priority,
        is_mnc: form.isMnc === "true",
        group_id: groupId,
        practicing_firm: form.firm,
        sector: form.natureOfBusiness || null,
      });
      onDone();
    } catch (e2) {
      const detail = (e2 as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Could not save — check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">
        Client code *
        <input required value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Name of the client *
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Entity type *
        <select required value={form.isListed} onChange={(e) => setForm({ ...form, isListed: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="false">Non-Listed</option>
          <option value="true">Listed</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Nature *
        <select required value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {NATURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Type of engagement
        <select value={form.engagementType} onChange={(e) => setForm({ ...form, engagementType: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {ENGAGEMENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Status *
        <select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Partner responsible *
        <select required value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {PARTNERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Priority
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        MNC status
        <select value={form.isMnc} onChange={(e) => setForm({ ...form, isMnc: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Group
        <input value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}
          placeholder="Type the group name…"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Firm
        <select value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {FIRMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Nature of business
        <input value={form.natureOfBusiness} onChange={(e) => setForm({ ...form, natureOfBusiness: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <div className="col-span-full flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {saving ? "Saving…" : "Save client"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
