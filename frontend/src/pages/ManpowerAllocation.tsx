import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { daysBetween, today } from "@/lib/dates";
import {
  type AllocationRow,
  type ClientRow,
  type EngagementLite,
  type StaffRow,
  DESIGNATIONS,
  ENGAGEMENT_TYPES,
  cancelBooking,
  createBooking,
  describeBookingError,
  fetchAllEngagements,
  fetchAllocations,
  fetchClientsList,
  fetchStaffList,
  findLabel,
} from "@/lib/mastersApi";

// The Manpower Allocation tab: a roster-shaped view over the same
// /allocations the scheduler board uses, built for how this firm actually
// staffs jobs — either off a booking already received from a client, or
// off an oral discussion with a partner. Every non-partner staff member
// appears with the client(s) they're currently on and the date range for
// each; partners and managers are tagged onto the booking, not listed as
// allocatees themselves. See docs/user-guide.md.

const BASIS_OPTIONS = [
  { label: "Booking received (confirmed)", value: "HARD" as const },
  { label: "Oral discussion (tentative)", value: "SOFT" as const },
];

function isArticleStaff(s: StaffRow): boolean {
  return s.staff_category === "ARTICLED_ASSISTANT";
}

function isPartnerStaff(s: StaffRow): boolean {
  return s.staff_category === "PARTNER";
}

function isManagerGradeStaff(s: StaffRow): boolean {
  return s.staff_category === "EMPLOYEE_CA";
}

function concurrentCap(s: StaffRow): number {
  return isArticleStaff(s) ? 3 : 4;
}

function designationLabel(s: StaffRow): string {
  return DESIGNATIONS.find((d) => d.designation === s.designation)?.label ?? s.designation;
}

const ACTIVE_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS"]);

export default function ManpowerAllocation() {
  const [q, setQ] = useState("");
  const [designationFilter, setDesignationFilter] = useState<"ALL" | "ARTICLE" | "CA">("ALL");

  const staffQuery = useQuery({ queryKey: ["masters-staff", ""], queryFn: () => fetchStaffList("") });
  const clientsQuery = useQuery({ queryKey: ["masters-clients", ""], queryFn: () => fetchClientsList("") });
  const engagementsQuery = useQuery({ queryKey: ["engagements-all"], queryFn: fetchAllEngagements });
  const allocationsQuery = useQuery({ queryKey: ["allocations-board"], queryFn: fetchAllocations });

  const loading = staffQuery.isLoading || clientsQuery.isLoading || engagementsQuery.isLoading || allocationsQuery.isLoading;

  const allStaff = staffQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const engagements = engagementsQuery.data ?? [];
  const allocations = allocationsQuery.data ?? [];

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const engagementById = new Map(engagements.map((e) => [e.id, e]));
  const activeAllocations = allocations.filter((a) => ACTIVE_STATUSES.has(a.status));

  const partners = allStaff.filter((s) => isPartnerStaff(s) && s.employment_status !== "EXITED");
  const managers = allStaff.filter((s) => isManagerGradeStaff(s) && s.employment_status !== "EXITED");

  let roster = allStaff.filter((s) => !isPartnerStaff(s) && s.employment_status !== "EXITED");
  if (designationFilter === "ARTICLE") roster = roster.filter(isArticleStaff);
  if (designationFilter === "CA") roster = roster.filter((s) => !isArticleStaff(s));
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    roster = roster.filter((s) => s.full_name.toLowerCase().includes(needle) || s.employee_code.toLowerCase().includes(needle));
  }
  roster = [...roster].sort((a, b) => a.full_name.localeCompare(b.full_name));

  const clientSummary = summarizeByClient(activeAllocations, engagementById, clientById);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Manpower Allocation</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Every staff member except partners, and which client(s) they're currently on — whether the booking came
            in confirmed or was agreed in an oral discussion. Client and assignment (service type) are picked from
            the masters; partner tagging is mandatory on every booking, manager tagging optional. An article can be
            on at most 3 clients at once, other staff at most 4 — the system blocks a booking that would go over.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Staff roster ({roster.length})
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={designationFilter}
                onChange={(e) => setDesignationFilter(e.target.value as typeof designationFilter)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="ALL">All staff</option>
                <option value="ARTICLE">Articles only</option>
                <option value="CA">Non-article staff</option>
              </select>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or employee code…"
                className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-slate-500">No staff match.</p>
          ) : (
            <div className="space-y-3">
              {roster.map((staff) => (
                <StaffAllocationRow
                  key={staff.id}
                  staff={staff}
                  bookings={activeAllocations
                    .filter((a) => a.staff_id === staff.id)
                    .sort((a, b) => a.date_from.localeCompare(b.date_from))}
                  clientById={clientById}
                  engagementById={engagementById}
                  staffById={new Map(allStaff.map((s) => [s.id, s]))}
                  clients={clients}
                  partners={partners}
                  managers={managers}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Client-wise summary</h2>
          <p className="mb-4 text-xs text-slate-500">Days are calendar days across each booking's date range; hours assume an 8-hour day.</p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : clientSummary.length === 0 ? (
            <p className="text-sm text-slate-500">No active bookings yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-1.5 pr-2">Client</th>
                  <th className="py-1.5 pr-2 text-right">Staff</th>
                  <th className="py-1.5 pr-2 text-right">Days</th>
                  <th className="py-1.5 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {clientSummary.map((row) => (
                  <tr key={row.clientId} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">{row.clientName}</td>
                    <td className="py-1.5 pr-2 text-right">{row.staffCount}</td>
                    <td className="py-1.5 pr-2 text-right">{row.totalDays}</td>
                    <td className="py-1.5 text-right font-medium">{row.totalHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function summarizeByClient(
  activeAllocations: AllocationRow[],
  engagementById: Map<string, EngagementLite>,
  clientById: Map<string, ClientRow>,
) {
  const byClient = new Map<string, { staffIds: Set<string>; days: number }>();
  for (const a of activeAllocations) {
    const eng = engagementById.get(a.engagement_id);
    if (!eng) continue;
    const entry = byClient.get(eng.client_id) ?? { staffIds: new Set<string>(), days: 0 };
    entry.staffIds.add(a.staff_id);
    entry.days += daysBetween(a.date_from, a.date_to) + 1;
    byClient.set(eng.client_id, entry);
  }
  return [...byClient.entries()]
    .map(([clientId, v]) => ({
      clientId,
      clientName: clientById.get(clientId)?.name ?? "Unknown client",
      staffCount: v.staffIds.size,
      totalDays: v.days,
      totalHours: v.days * 8,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

function StaffAllocationRow({
  staff,
  bookings,
  clientById,
  engagementById,
  staffById,
  clients,
  partners,
  managers,
}: {
  staff: StaffRow;
  bookings: AllocationRow[];
  clientById: Map<string, ClientRow>;
  engagementById: Map<string, EngagementLite>;
  staffById: Map<string, StaffRow>;
  clients: ClientRow[];
  partners: StaffRow[];
  managers: StaffRow[];
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const cap = concurrentCap(staff);
  const atCap = bookings.length >= cap;

  async function handleRemove(allocationId: string) {
    if (!window.confirm("Remove this booking?")) return;
    await cancelBooking(allocationId);
    qc.invalidateQueries({ queryKey: ["allocations-board"] });
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {staff.full_name} <span className="font-mono text-xs text-slate-500">({staff.employee_code})</span>
          </p>
          <p className="text-xs text-slate-500">
            {designationLabel(staff)}
            {" · "}
            <span className={atCap ? "font-semibold text-amber-700" : ""}>
              {bookings.length}/{cap} clients
            </span>
          </p>
        </div>
        <button
          disabled={atCap}
          onClick={() => setShowAdd((s) => !s)}
          title={atCap ? `Already at the ${cap}-client cap for this grade` : undefined}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add booking
        </button>
      </div>

      {bookings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {bookings.map((b) => {
            const eng = engagementById.get(b.engagement_id);
            const client = eng ? clientById.get(eng.client_id) : undefined;
            const partner = b.partner_id ? staffById.get(b.partner_id) : undefined;
            const manager = b.reporting_manager_id ? staffById.get(b.reporting_manager_id) : undefined;
            return (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-xs text-slate-700"
                title={[
                  eng ? findLabel(ENGAGEMENT_TYPES, eng.service_type) : "",
                  b.booking_type === "SOFT" ? "Oral discussion (tentative)" : "Booking received (confirmed)",
                  partner ? `Partner: ${partner.full_name}` : "",
                  manager ? `Manager: ${manager.full_name}` : "",
                  b.notes ? `Remarks: ${b.notes}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <span className="font-medium">{client?.name ?? "Unknown client"}</span>
                <span className="text-slate-400">{b.date_from} → {b.date_to}</span>
                {b.booking_type === "SOFT" && <span className="rounded bg-amber-100 px-1 text-amber-800">oral</span>}
                <button onClick={() => handleRemove(b.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove booking">
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddBookingForm
          staff={staff}
          clients={clients}
          partners={partners}
          managers={managers}
          onDone={() => {
            setShowAdd(false);
            qc.invalidateQueries({ queryKey: ["allocations-board"] });
            qc.invalidateQueries({ queryKey: ["engagements-all"] });
          }}
        />
      )}
    </div>
  );
}

function AddBookingForm({
  staff,
  clients,
  partners,
  managers,
  onDone,
}: {
  staff: StaffRow;
  clients: ClientRow[];
  partners: StaffRow[];
  managers: StaffRow[];
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [serviceType, setServiceType] = useState(ENGAGEMENT_TYPES[0].value);
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [basis, setBasis] = useState<"HARD" | "SOFT">("HARD");
  const [partnerId, setPartnerId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    if (!partnerId) {
      setError("Partner tagging is mandatory — pick the partner responsible.");
      return;
    }
    if (dateTo < dateFrom) {
      setError("End date can't be before the start date.");
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await createBooking({
        staffId: staff.id,
        isArticle: isArticleStaff(staff),
        clientId,
        clientCode: client.client_code,
        serviceType,
        dateFrom,
        dateTo,
        bookingType: basis,
        partnerId,
        managerId: managerId || null,
        notes,
      });
      onDone();
    } catch (err) {
      setError(describeBookingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-4">
      <label className="col-span-2 text-xs text-slate-600 sm:col-span-1">
        Client
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
          {sortedClients.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.client_code})</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        Assignment
        <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
          {ENGAGEMENT_TYPES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        Basis
        <select value={basis} onChange={(e) => setBasis(e.target.value as "HARD" | "SOFT")} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
          {BASIS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        From
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        To
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        Partner <span className="text-red-600">*</span>
        <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="">— select partner —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        Manager (optional)
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="">— none —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      </label>
      <label className="col-span-2 text-xs text-slate-600 sm:col-span-4">
        Remarks
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note — e.g. what was agreed and with whom"
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      {error && <p className="col-span-2 text-xs text-red-600 sm:col-span-4">{error}</p>}

      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {busy ? "Saving…" : "Add booking"}
        </button>
      </div>
    </form>
  );
}
