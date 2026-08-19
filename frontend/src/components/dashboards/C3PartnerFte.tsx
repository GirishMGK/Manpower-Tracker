import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PartnerFteRow } from "@/types/dashboard";
import { colorForKey } from "./palette";
import { pivotToWide } from "./pivot";

type Props = {
  rows: PartnerFteRow[];
  onSegmentClick: (partnerId: string, designation: string) => void;
};

export default function C3PartnerFte({ rows, onSegmentClick }: Props) {
  const { data, series } = useMemo(
    () => pivotToWide(rows, "partner_name", "designation" as keyof PartnerFteRow, "fte"),
    [rows],
  );
  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.partner_name, r.partner_id);
    return m;
  }, [rows]);

  const height = Math.max(200, data.length * 32 + 60);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="partner_name" tick={{ fontSize: 11 }} width={140} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="a"
            fill={colorForKey(s)}
            onClick={(d: { partner_name?: string }) => onSegmentClick(idByName.get(d.partner_name ?? "") ?? "", s)}
            cursor="pointer"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
