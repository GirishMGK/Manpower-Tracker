import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.full_name}</h1>
      <p className="mt-1 text-slate-500">Role: {user?.role}</p>

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
