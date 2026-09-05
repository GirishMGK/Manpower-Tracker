import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";
import { type UpdateCheckResult, checkForUpdates } from "@/lib/updatesApi";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.full_name}</h1>
          <p className="mt-1 text-slate-500">Role: {user?.role}</p>
        </div>
        <UpdateChecker />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/masters"
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Manage staff &amp; clients →
        </Link>
        <Link
          to="/allocation-board"
          className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Manpower allocation →
        </Link>
        <Link
          to="/schedule"
          className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Open scheduler board →
        </Link>
        <Link
          to="/dashboards"
          className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Open dashboards →
        </Link>
        <Link
          to="/reports"
          className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Open report library →
        </Link>
        <Link
          to="/me"
          className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          My bookings →
        </Link>
      </div>
    </div>
  );
}

/** "Check for updates" (desktop build): a manual, user-triggered check —
 * no background polling, no nagging on login. Compares this build's own
 * version against the firm's latest GitHub Release and, if there's a
 * newer one, links straight to the installer download; the user runs it
 * themselves the same way they installed this version, since the app has
 * no silent self-update. */
function UpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  async function handleCheck() {
    setChecking(true);
    try {
      setResult(await checkForUpdates());
    } catch {
      setResult({
        current_version: "",
        latest_version: null,
        update_available: false,
        download_url: null,
        release_notes_url: null,
        checked_ok: false,
        message: "Could not check for updates — try again.",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="shrink-0 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        {result?.current_version ? <span className="text-xs text-slate-400">v{result.current_version}</span> : null}
        <button
          onClick={handleCheck}
          disabled={checking}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>
      {result &&
        (result.checked_ok ? (
          result.update_available ? (
            <p className="mt-2 max-w-xs text-xs text-amber-700">
              Update available — v{result.latest_version}.{" "}
              {result.download_url && (
                <a href={result.download_url} target="_blank" rel="noreferrer" className="font-semibold underline">
                  Download the installer
                </a>
              )}
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-700">You're on the latest version.</p>
          )
        ) : (
          <p className="mt-2 max-w-xs text-xs text-red-600">{result.message}</p>
        ))}
    </div>
  );
}
