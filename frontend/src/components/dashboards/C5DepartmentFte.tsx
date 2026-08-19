import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import type { DepartmentFteResponse } from "@/types/dashboard";
import { colorForKey } from "./palette";
import { pivotToWide } from "./pivot";

type Props = {
  data: DepartmentFteResponse;
  onSliceClick: (departmentId: string | null) => void;
};

export default function C5DepartmentFte({ data, onSliceClick }: Props) {
  const idByName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of data.current) m.set(r.department_name, r.department_id);
    return m;
  }, [data.current]);

  const { data: trendData, series } = useMemo(
    () => pivotToWide(data.trend, "month", "department_name" as never, "fte" as never),
    [data.trend],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <p className="mb-1 text-center text-xs text-slate-500">Current period share</p>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data.current}
              dataKey="fte"
              nameKey="department_name"
              innerRadius={50}
              outerRadius={85}
              onClick={(d: { department_name?: string }) => onSliceClick(idByName.get(d.department_name ?? "") ?? null)}
              cursor="pointer"
              label={({ department_name, percent }: { department_name?: string; percent?: number }) =>
                `${department_name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
            >
              {data.current.map((entry) => (
                <Cell key={entry.department_id ?? "unassigned"} fill={colorForKey(entry.department_name)} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => v.toFixed(2)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-1 text-center text-xs text-slate-500">12-month FTE trend</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {series.map((s) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colorForKey(s)} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
