import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.full_name}</h1>
      <p className="mt-1 text-slate-500">Role: {user?.role}</p>

      <div className="mt-6 flex gap-3">
        <Link
          to="/schedule"
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        Forecasting, timesheets and the mobile view land in later build
        phases (§13 P9–P11). The scheduler board, dashboards and report
        library above are live.
      </div>
    </div>
  );
}
