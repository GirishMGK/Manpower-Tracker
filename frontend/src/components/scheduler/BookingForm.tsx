import { useEffect, useState } from "react";
import { fetchEngagementsLookup, validateAllocation } from "@/lib/schedulerApi";
import { ALLOCATION_ROLES, type BoardAllocation, type EngagementLookupItem, type RuleViolation } from "@/types/scheduler";

export type BookingFormValues = {
  engagement_id: string;
  engagement_label: string;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  status: string;
  booking_type: string;
};

type Props = {
  staffId: string;
  staffLabel: string;
  initial: BookingFormValues;
  existingAllocation?: BoardAllocation;
  onClose: () => void;
  onSave: (values: BookingFormValues, overrides: { code: string; reason: string }[]) => Promise<void>;
  onCancelBooking?: (reason: string) => Promise<void>;
};

export default function BookingForm({ staffId, staffLabel, initial, existingAllocation, onClose, onSave, onCancelBooking }: Props) {
  const [values, setValues] = useState<BookingFormValues>(initial);
  const [query, setQuery] = useState(initial.engagement_label);
  const [results, setResults] = useState<EngagementLookupItem[]>([]);
  const [violations, setViolations] = useState<RuleViolation[] | null>(null);
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!query || query === initial.engagement_label) return;
    const handle = setTimeout(async () => {
      const rows = await fetchEngagementsLookup({ q: query });
      setResults(rows);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickEngagement(item: EngagementLookupItem) {
    setValues((v) => ({ ...v, engagement_id: item.id, engagement_label: `${item.client_name} — ${item.engagement_code}` }));
    setQuery(`${item.client_name} — ${item.engagement_code}`);
    setResults([]);
  }

  async function runCheck() {
    if (!values.engagement_id) return;
    setBusy(true);
    try {
      const result = await validateAllocation({
        staff_id: staffId,
        engagement_id: values.engagement_id,
        role_on_engagement: values.role_on_engagement,
        date_from: values.date_from,
        date_to: values.date_to,
        allocation_pct: values.allocation_pct,
        exclude_allocation_id: existingAllocation?.id,
      });
      setViolations(result.violations);
    } finally {
      setBusy(false);
    }
  }

  const blocking = violations?.filter((v) => v.severity === "BLOCK") ?? [];
  const warnings = violations?.filter((v) => v.severity === "WARN") ?? [];
  const infos = violations?.filter((v) => v.severity === "INFO") ?? [];
  const allWarningsResolved = warnings.every((w) => (overrideReasons[w.code] ?? "").trim().length > 0);

  async function handleSave() {
    setBusy(true);
    try {
      const overrides = warnings.map((w) => ({ code: w.code, reason: overrideReasons[w.code] }));
      await onSave(values, overrides);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{existingAllocation ? "Edit booking" : "New booking"}</h2>
        <p className="text-sm text-slate-500">{staffLabel}</p>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <label className="text-xs font-medium text-slate-600">Engagement</label>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setViolations(null);
              }}
              placeholder="Search client or engagement code…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickEngagement(r)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {r.client_name} — {r.engagement_code}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Role</label>
              <select
                value={values.role_on_engagement}
                onChange={(e) => { setValues((v) => ({ ...v, role_on_engagement: e.target.value })); setViolations(null); }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {ALLOCATION_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Allocation %</label>
              <input
                type="number" min={1} max={100} value={values.allocation_pct}
                onChange={(e) => { setValues((v) => ({ ...v, allocation_pct: Number(e.target.value) })); setViolations(null); }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">From</label>
              <input
                type="date" value={values.date_from}
                onChange={(e) => { setValues((v) => ({ ...v, date_from: e.target.value })); setViolations(null); }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">To</label>
              <input
                type="date" value={values.date_to}
                onChange={(e) => { setValues((v) => ({ ...v, date_to: e.target.value })); setViolations(null); }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Booking type</label>
              <select
                value={values.booking_type}
                onChange={(e) => setValues((v) => ({ ...v, booking_type: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="HARD">Hard</option>
                <option value="SOFT">Soft (pipeline)</option>
                <option value="TENTATIVE">Tentative</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select
                value={values.status}
                onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="PROPOSED">Proposed</option>
                <option value="CONFIRMED">Confirmed</option>
              </select>
            </div>
          </div>

          {violations && blocking.length > 0 && (
            <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {blocking.map((v) => <div key={v.code}>⛔ {v.message}</div>)}
            </div>
          )}
          {violations && warnings.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {warnings.map((w) => (
                <div key={w.code}>
                  <div>⚠️ {w.message}</div>
                  <input
                    placeholder="Override reason (required to save)"
                    value={overrideReasons[w.code] ?? ""}
                    onChange={(e) => setOverrideReasons((r) => ({ ...r, [w.code]: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-amber-300 px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          )}
          {violations && infos.length > 0 && (
            <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
              {infos.map((v) => <div key={v.code}>ℹ️ {v.message}</div>)}
            </div>
          )}
          {violations && violations.length === 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800">✓ No conflicts</div>
          )}

          {showCancel && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-medium text-slate-600">Cancellation reason</label>
              <input
                value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button" disabled={busy || !cancelReason.trim()}
                onClick={async () => { setBusy(true); try { await onCancelBooking?.(cancelReason); } finally { setBusy(false); } }}
                className="w-full rounded-md bg-red-600 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm cancel
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            {existingAllocation && onCancelBooking && (
              <button type="button" onClick={() => setShowCancel((s) => !s)} className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                Cancel booking
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Close
            </button>
            {!violations ? (
              <button
                type="button" disabled={busy || !values.engagement_id}
                onClick={runCheck}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Check for conflicts
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || blocking.length > 0 || !allWarningsResolved}
                onClick={handleSave}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
