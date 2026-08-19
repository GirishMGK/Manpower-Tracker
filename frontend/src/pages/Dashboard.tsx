import { useAuthStore } from "@/lib/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.full_name}</h1>
      <p className="mt-1 text-slate-500">Role: {user?.role}</p>
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        The scheduler board, dashboards and report library land in later build
        phases (§13 P4–P11). This placeholder confirms authentication, RBAC
        and the API are wired end-to-end.
      </div>
    </div>
  );
}
