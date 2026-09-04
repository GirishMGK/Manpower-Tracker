import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type ClientRow,
  type ImportSummary,
  type StaffRow,
  commitClientsImport,
  commitStaffImport,
  createClient,
  createStaff,
  downloadClientsErrorWorkbook,
  downloadStaffErrorWorkbook,
  fetchClientsList,
  fetchStaffList,
  validateClientsImport,
  validateStaffImport,
} from "@/lib/mastersApi";
import { fetchOffices } from "@/lib/schedulerApi";

// Designation -> grade_rank, mirroring backend/app/models/enums.py's
// DESIGNATION_GRADE_RANK. The API requires grade_rank as a plain int; this
// spares whoever's filling in the form from having to know the numbering.
const DESIGNATIONS: { value: string; label: string; gradeRank: number }[] = [
  { value: "MANAGING_PARTNER", label: "Managing Partner", gradeRank: 1 },
  { value: "PARTNER", label: "Partner", gradeRank: 2 },
  { value: "ASSOCIATE_PARTNER", label: "Associate Partner", gradeRank: 3 },
  { value: "DIRECTOR", label: "Director", gradeRank: 3 },
  { value: "SENIOR_MANAGER", label: "Senior Manager", gradeRank: 4 },
  { value: "MANAGER", label: "Manager", gradeRank: 5 },
  { value: "ASSISTANT_MANAGER", label: "Assistant Manager", gradeRank: 6 },
  { value: "SENIOR_ASSOCIATE", label: "Senior Associate", gradeRank: 7 },
  { value: "ASSOCIATE", label: "Associate", gradeRank: 8 },
  { value: "EXECUTIVE", label: "Executive", gradeRank: 9 },
  { value: "TRAINEE", label: "Trainee", gradeRank: 10 },
  { value: "ARTICLE_Y3", label: "Article (Year 3)", gradeRank: 10 },
  { value: "ARTICLE_Y2", label: "Article (Year 2)", gradeRank: 11 },
  { value: "ARTICLE_Y1", label: "Article (Year 1)", gradeRank: 12 },
];

const STAFF_CATEGORIES = [
  "PARTNER", "DIRECTOR", "EMPLOYEE_CA", "EMPLOYEE_OTHER_PROF", "EMPLOYEE_SEMI_QUALIFIED",
  "ARTICLED_ASSISTANT", "INDUSTRIAL_TRAINEE", "PAID_ASSISTANT", "SUPPORT_STAFF", "CONSULTANT_EXTERNAL",
];

const ENTITY_CLASSES = [
  "LISTED", "UNLISTED_PUBLIC", "PRIVATE", "LLP", "BANK", "NBFC", "INSURANCE",
  "GOVT_COMPANY", "TRUST", "FOREIGN_SUB",
];

const RELATIONSHIP_STATUSES = ["PROSPECT", "ACTIVE", "DORMANT", "EXITED"];
const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH", "SIGNIFICANT"];

function labelize(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
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
  onValidate,
  onCommit,
  onDownloadErrors,
  onImported,
}: {
  entityLabel: string;
  onValidate: (file: File) => Promise<ImportSummary>;
  onCommit: (file: File, commitValidOnly: boolean) => Promise<ImportSummary>;
  onDownloadErrors: (file: File) => Promise<void>;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState<"validate" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        Upload an .xlsx file. Nothing is saved until you click Commit — Validate first is a dry run that just
        checks the file. Re-importing the same code updates that record instead of duplicating it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
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

function StaffPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const listQuery = useQuery({ queryKey: ["masters-staff", q], queryFn: () => fetchStaffList(q) });
  const officesQuery = useQuery({ queryKey: ["offices"], queryFn: fetchOffices, staleTime: 5 * 60_000 });

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
            offices={officesQuery.data ?? []}
            onDone={() => {
              setShowAdd(false);
              qc.invalidateQueries({ queryKey: ["masters-staff"] });
            }}
          />
        )}

        <StaffTable rows={listQuery.data ?? []} loading={listQuery.isLoading} />
      </Card>

      <ImportPanel
        entityLabel="staff"
        onValidate={validateStaffImport}
        onCommit={commitStaffImport}
        onDownloadErrors={downloadStaffErrorWorkbook}
        onImported={() => qc.invalidateQueries({ queryKey: ["masters-staff"] })}
      />
    </div>
  );
}

function StaffTable({ rows, loading }: { rows: StaffRow[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No staff yet — add one above or import a spreadsheet.</p>;
  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Designation</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
              <td className="px-3 py-1.5 font-mono text-xs">{r.employee_code}</td>
              <td className="px-3 py-1.5">{r.full_name}</td>
              <td className="px-3 py-1.5">{labelize(r.designation)}</td>
              <td className="px-3 py-1.5">{labelize(r.staff_category)}</td>
              <td className="px-3 py-1.5">{labelize(r.employment_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffAddForm({ offices, onDone }: { offices: { id: string; name: string }[]; onDone: () => void }) {
  const [form, setForm] = useState({
    employee_code: "", full_name: "", official_email: "", mobile: "",
    staff_category: "EMPLOYEE_CA", designation: "ASSOCIATE", base_office_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const gradeRank = DESIGNATIONS.find((d) => d.value === form.designation)?.gradeRank ?? 8;
      await createStaff({
        employee_code: form.employee_code,
        full_name: form.full_name,
        official_email: form.official_email || null,
        mobile: form.mobile || null,
        staff_category: form.staff_category,
        designation: form.designation,
        grade_rank: gradeRank,
        base_office_id: form.base_office_id || null,
        current_office_id: form.base_office_id || null,
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
        Full name *
        <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Email
        <input type="email" value={form.official_email} onChange={(e) => setForm({ ...form, official_email: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Mobile
        <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Office
        <select value={form.base_office_id} onChange={(e) => setForm({ ...form, base_office_id: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="">—</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Category *
        <select required value={form.staff_category} onChange={(e) => setForm({ ...form, staff_category: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {STAFF_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Designation *
        <select required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {DESIGNATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
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

function ClientsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const listQuery = useQuery({ queryKey: ["masters-clients", q], queryFn: () => fetchClientsList(q) });

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
            }}
          />
        )}

        <ClientsTable rows={listQuery.data ?? []} loading={listQuery.isLoading} />
      </Card>

      <ImportPanel
        entityLabel="clients"
        onValidate={validateClientsImport}
        onCommit={commitClientsImport}
        onDownloadErrors={downloadClientsErrorWorkbook}
        onImported={() => qc.invalidateQueries({ queryKey: ["masters-clients"] })}
      />
    </div>
  );
}

function ClientsTable({ rows, loading }: { rows: ClientRow[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No clients yet — add one above or import a spreadsheet.</p>;
  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Entity class</th>
            <th className="px-3 py-2">Relationship</th>
            <th className="px-3 py-2">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
              <td className="px-3 py-1.5 font-mono text-xs">{r.client_code}</td>
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5">{labelize(r.entity_class)}</td>
              <td className="px-3 py-1.5">{labelize(r.relationship_status)}</td>
              <td className="px-3 py-1.5">{labelize(r.risk_rating)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientAddForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    client_code: "", name: "", entity_class: "PRIVATE",
    relationship_status: "PROSPECT", risk_rating: "MEDIUM",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createClient(form);
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
        Name *
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Entity class *
        <select required value={form.entity_class} onChange={(e) => setForm({ ...form, entity_class: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {ENTITY_CLASSES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Relationship
        <select value={form.relationship_status} onChange={(e) => setForm({ ...form, relationship_status: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {RELATIONSHIP_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Risk rating
        <select value={form.risk_rating} onChange={(e) => setForm({ ...form, risk_rating: e.target.value })}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
          {RISK_RATINGS.map((r) => <option key={r} value={r}>{labelize(r)}</option>)}
        </select>
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
