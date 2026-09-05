import { useMemo } from "react";
import type { HeadcountRow } from "@/types/dashboard";

type Props = {
  rows: HeadcountRow[];
  onCellClick: (officeId: string | null, designation: string) => void;
};

/** Heatmap table per §7.1's own description of C2 ("heatmap table"). */
export default function C2LocationGrade({ rows, onCellClick }: Props) {
  const { offices, designations, matrix, max } = useMemo(() => {
    const officeSet = new Map<string, string | null>();
    const designationSet = new Set<string>();
    const m = new Map<string, number>();
    let maxVal = 0;
    for (const r of rows) {
      officeSet.set(r.office_name, r.office_id);
      designationSet.add(r.designation ?? "");
      const key = `${r.office_name}::${r.designation}`;
      m.set(key, r.count);
      maxVal = Math.max(maxVal, r.count);
    }
    return {
      offices: Array.from(officeSet.entries()),
      designations: Array.from(designationSet).sort(),
      matrix: m,
      max: maxVal || 1,
    };
  }, [rows]);

  function heat(count: number): string {
    const t = count / max;
    const g = Math.round(255 - t * 130);
    return `rgb(255,${g},${Math.round(255 - t * 200)})`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white p-1 text-left font-medium text-slate-600">Office</th>
            {designations.map((d) => (
              <th key={d} className="p-1 text-center font-medium text-slate-600" style={{ minWidth: 60 }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offices.map(([name, id]) => (
            <tr key={name}>
              <td className="sticky left-0 bg-white p-1 font-medium text-slate-700">{name}</td>
              {designations.map((d) => {
                const count = matrix.get(`${name}::${d}`) ?? 0;
                return (
                  <td
                    key={d}
                    onClick={() => count > 0 && onCellClick(id, d)}
                    className={count > 0 ? "cursor-pointer text-center" : "text-center text-slate-300"}
                    style={{ backgroundColor: count > 0 ? heat(count) : undefined, padding: "6px" }}
                  >
                    {count || "-"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
