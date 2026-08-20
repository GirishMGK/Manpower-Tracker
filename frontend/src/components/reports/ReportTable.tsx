import type { ReportRow } from "@/types/report";

function humanizeHeader(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

type Props = {
  rows: ReportRow[];
  loading: boolean;
};

export default function ReportTable({ rows, loading }: Props) {
  if (loading) return <p className="p-4 text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="p-4 text-sm text-slate-500">No rows for the selected filters.</p>;

  // Every report pairs a raw *_id (staff_id, engagement_id, ...) with a
  // human-readable name/code field alongside it (full_name, engagement_code,
  // ...) — the id is there for the API/drill-through, not for display.
  const columns = Object.keys(rows[0]).filter((c) => !c.endsWith("_id"));

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: "70vh" }}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-900 text-white">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{humanizeHeader(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 ? "bg-slate-50" : "bg-white"}>
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-1.5 text-slate-700">{formatCell(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
