type StaffRow = { staff_id: string; full_name: string; employee_code: string; staff_category: string; designation: string };

type Props = {
  title: string;
  rows: StaffRow[];
  loading: boolean;
  onClose: () => void;
};

export default function HeadcountDrillModal({ title, rows, loading, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1 pr-3">Code</th>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3">Designation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff_id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{r.employee_code}</td>
                    <td className="py-1.5 pr-3">{r.full_name}</td>
                    <td className="py-1.5 pr-3">{r.staff_category}</td>
                    <td className="py-1.5 pr-3">{r.designation}</td>
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
