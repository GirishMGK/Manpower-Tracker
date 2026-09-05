import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { PartnerPortfolioRow } from "@/types/dashboard";

type Props = {
  rows: PartnerPortfolioRow[];
  onPointClick: (partnerId: string) => void;
};

const RISK_COLORS = ["#16a34a", "#65a30d", "#d97706", "#dc2626"]; // low -> significant

function riskColor(score: number): string {
  return RISK_COLORS[Math.min(3, Math.max(0, Math.round(score) - 1))];
}

export default function C4PartnerPortfolio({ rows, onPointClick }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" dataKey="fee_under_management" name="Fee under management" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
        <YAxis type="number" dataKey="fte_deployed" name="FTE deployed" tick={{ fontSize: 11 }} />
        <ZAxis type="number" dataKey="engagement_count" range={[60, 400]} name="Engagements" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(value: number, name: string) => (name === "Fee under management" ? [`₹${value.toLocaleString("en-IN")}`, name] : [value, name])}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as PartnerPortfolioRow;
            return (
              <div className="rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
                <div className="font-semibold">{p.partner_name}</div>
                <div>Fee under mgmt: ₹{p.fee_under_management.toLocaleString("en-IN")}</div>
                <div>FTE deployed: {p.fte_deployed}</div>
                <div>Engagements: {p.engagement_count}</div>
                <div>Avg risk score: {p.avg_risk_score}</div>
              </div>
            );
          }}
        />
        <Scatter
          data={rows}
          onClick={(d: PartnerPortfolioRow) => onPointClick(d.partner_id)}
          cursor="pointer"
          shape={(props: { cx?: number; cy?: number; payload?: PartnerPortfolioRow }) => {
            const { cx = 0, cy = 0, payload } = props;
            const r = Math.sqrt((payload?.engagement_count ?? 1)) * 4 + 4;
            return <circle cx={cx} cy={cy} r={r} fill={riskColor(payload?.avg_risk_score ?? 2)} fillOpacity={0.75} stroke="white" />;
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
