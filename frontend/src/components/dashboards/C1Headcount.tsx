import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HeadcountRow } from "@/types/dashboard";
import { colorForKey } from "./palette";
import { pivotToWide } from "./pivot";

type Props = {
  rows: HeadcountRow[];
  onSegmentClick: (officeId: string | null, category: string) => void;
};

export default function C1Headcount({ rows, onSegmentClick }: Props) {
  const [mode, setMode] = useState<"absolute" | "percent">("absolute");

  const { data, series } = useMemo(
    () => pivotToWide(rows, "office_name", "staff_category" as keyof HeadcountRow, "count"),
    [rows],
  );

  const chartData = useMemo(() => {
    if (mode === "absolute") return data;
    return data.map((row) => {
      const total = series.reduce((sum, s) => sum + (Number(row[s]) || 0), 0) || 1;
      const out: Record<string, unknown> = { office_name: row.office_name };
      for (const s of series) out[s] = Math.round(((Number(row[s]) || 0) / total) * 1000) / 10;
      return out;
    });
  }, [data, series, mode]);

  const officeIdByName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) m.set(r.office_name, r.office_id);
    return m;
  }, [rows]);

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1 text-xs">
        <button
          onClick={() => setMode("absolute")}
          className={`rounded px-2 py-1 ${mode === "absolute" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Absolute
        </button>
        <button
          onClick={() => setMode("percent")}
          className={`rounded px-2 py-1 ${mode === "percent" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          % of office
        </button>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="office_name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit={mode === "percent" ? "%" : ""} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="a"
              fill={colorForKey(s)}
              onClick={(d: { office_name?: string }) => onSegmentClick(officeIdByName.get(d.office_name ?? "") ?? null, s)}
              cursor="pointer"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
