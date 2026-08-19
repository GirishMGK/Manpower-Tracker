import type { DrillRow } from "@/types/dashboard";

type Props = {
  title: string;
  rows: DrillRow[];
  loading: boolean;
  onClose: () => void;
};

export default function DrillThroughModal({ title, rows, loading, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No underlying records for this segment.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1 pr-3">Staff</th>
                  <th className="py-1 pr-3">Designation</th>
                  <th className="py-1 pr-3">Client</th>
                  <th className="py-1 pr-3">Engagement</th>
                  <th className="py-1 pr-3">Role</th>
                  <th className="py-1 pr-3">Dates</th>
                  <th className="py-1 pr-3">%</th>
                  <th className="py-1 pr-3">FTE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.allocation_id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{r.staff_name}</td>
                    <td className="py-1.5 pr-3">{r.designation}</td>
                    <td className="py-1.5 pr-3">{r.client_name}</td>
                    <td className="py-1.5 pr-3">{r.engagement_code}</td>
                    <td className="py-1.5 pr-3">{r.role_on_engagement}</td>
                    <td className="py-1.5 pr-3">{r.date_from} → {r.date_to}</td>
                    <td className="py-1.5 pr-3">{r.allocation_pct}%</td>
                    <td className="py-1.5 pr-3">{r.fte.toFixed(2)}</td>
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
