import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.full_name}</h1>
      <p className="mt-1 text-slate-500">Role: {user?.role}</p>

      <Link
        to="/schedule"
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Open scheduler board →
      </Link>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        Dashboards (C1–C18) and the report library (RP-01..RP-17) land in
        later build phases (§13 P6–P7). The scheduler board above is live.
      </div>
    </div>
  );
}
