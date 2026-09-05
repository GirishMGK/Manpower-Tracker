import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DepartmentGradeRow } from "@/types/dashboard";
import { colorForKey } from "./palette";
import { pivotToWide } from "./pivot";

type Props = {
  rows: DepartmentGradeRow[];
  onSegmentClick: (departmentId: string | null, designation: string) => void;
};

export default function C6DepartmentGrade({ rows, onSegmentClick }: Props) {
  const { data, series } = useMemo(
    () => pivotToWide(rows, "department_name", "designation" as keyof DepartmentGradeRow, "fte"),
    [rows],
  );
  const idByName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) m.set(r.department_name, r.department_id);
    return m;
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="department_name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {series.map((s) => (
          <Bar
            key={s}
            dataKey={s}
            fill={colorForKey(s)}
            onClick={(d: { department_name?: string }) => onSegmentClick(idByName.get(d.department_name ?? "") ?? null, s)}
            cursor="pointer"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
