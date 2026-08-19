import { Download, Image as ImageIcon } from "lucide-react";
import { useRef } from "react";
import { downloadChartExport } from "@/lib/dashboardApi";
import { exportContainerAsPng } from "@/lib/exportPng";
import type { DashboardFilters } from "@/types/dashboard";

type Props = {
  id: string;
  title: string;
  chartKey: string;
  filters: DashboardFilters;
  children: React.ReactNode;
};

export default function ChartCard({ id, title, chartKey, filters, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="flex gap-1">
          <button
            title="Export to Excel"
            onClick={() => downloadChartExport(chartKey, filters)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Download size={15} />
          </button>
          <button
            title="Export to PNG"
            onClick={() => ref.current && exportContainerAsPng(ref.current, `${id}.png`)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ImageIcon size={15} />
          </button>
        </div>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}
