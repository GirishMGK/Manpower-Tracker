import { useEffect, useState } from "react";
import { downloadMyCalendar, fetchMyAllocations, fetchMyLeaveBalance, fetchMyProfile, fetchMyTimesheets } from "@/lib/meApi";
import { formatDateRange, leaveBalanceSummary } from "@/lib/meFormat";
import type { MeAllocation, MeLeaveBalance, MeProfile, MeTimesheet } from "@/types/me";

/** Mobile-first self-service view (§10.2, Phase P11) — a single narrow
 * column that works fine at phone width, no sidebar/table chrome the
 * desktop pages use. Deliberately read-only: booking/leave/timesheet
 * actions still go through the existing scheduler/leave/timesheet APIs. */
export default function Me() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [allocations, setAllocations] = useState<MeAllocation[]>([]);
  const [leave, setLeave] = useState<MeLeaveBalance | null>(null);
  const [timesheets, setTimesheets] = useState<MeTimesheet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await fetchMyProfile();
        if (cancelled) return;
        setProfile(p);
        if (!p.staff) return; // system/admin login with no roster record — nothing else to show
        const [allocs, balance, ts] = await Promise.all([fetchMyAllocations(), fetchMyLeaveBalance(), fetchMyTimesheets()]);
        if (cancelled) return;
        setAllocations(allocs);
        setLeave(balance);
        setTimesheets(ts);
      } catch {
        if (!cancelled) setError("Couldn't load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!profile) return null;

  // The staff roster record's name is the "real" identity for a self-service
  // view; the login's own full_name (profile.full_name) is a fallback for
  // system/admin accounts with no linked staff record.
  const displayName = profile.staff?.full_name ?? profile.full_name;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900">{displayName}</h1>
      <p className="text-sm text-slate-500">{profile.role}</p>

      {!profile.staff ? (
        <div className="mt-6 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          This login isn't linked to a staff record, so there's no roster/booking data to show.
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Profile</div>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Employee code</dt><dd>{profile.staff.employee_code}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Designation</dt><dd>{profile.staff.designation}</dd></div>
              {profile.staff.mobile && (
                <div className="flex justify-between"><dt className="text-slate-500">Mobile</dt><dd>{profile.staff.mobile}</dd></div>
              )}
            </dl>
          </section>

          {leave && (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Leave balance</div>
              <p className="mt-2 text-sm text-slate-800">{leaveBalanceSummary(leave)}</p>
              {leave.pending_days > 0 && (
                <p className="mt-1 text-xs text-amber-600">{leave.pending_days} day(s) pending approval</p>
              )}
            </section>
          )}

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Upcoming bookings</div>
              <button
                type="button"
                onClick={downloadMyCalendar}
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                Download .ics
              </button>
            </div>
            {allocations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing booked in the next 60 days.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {allocations.map((a) => (
                  <li key={a.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{a.client_name}</span>
                      <span className="text-xs text-slate-500">{a.allocation_pct.toFixed(0)}%</span>
                    </div>
                    <div className="text-xs text-slate-500">{a.engagement_code} · {a.role_on_engagement}</div>
                    <div className="text-xs text-slate-400">{formatDateRange(a.date_from, a.date_to)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Recent timesheets</div>
            {timesheets.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No timesheet entries in the last 30 days.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {timesheets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">{t.work_date}</span>
                    <span className="text-slate-500">{t.hours}h</span>
                    <span className="text-xs text-slate-400">{t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
