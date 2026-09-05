import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import C1Headcount from "@/components/dashboards/C1Headcount";
import C2LocationGrade from "@/components/dashboards/C2LocationGrade";
import C3PartnerFte from "@/components/dashboards/C3PartnerFte";
import C4PartnerPortfolio from "@/components/dashboards/C4PartnerPortfolio";
import C5DepartmentFte from "@/components/dashboards/C5DepartmentFte";
import C6DepartmentGrade from "@/components/dashboards/C6DepartmentGrade";
import ChartCard from "@/components/dashboards/ChartCard";
import DashboardFilterBar from "@/components/dashboards/DashboardFilterBar";
import DrillThroughModal from "@/components/dashboards/DrillThroughModal";
import HeadcountDrillModal from "@/components/dashboards/HeadcountDrillModal";
import {
  fetchC1, fetchC2, fetchC3, fetchC4, fetchC5, fetchC6,
  fetchClientGroups, fetchDrill, fetchDrillHeadcount, fetchPartners,
} from "@/lib/dashboardApi";
import { fetchDepartments, fetchOffices } from "@/lib/schedulerApi";
import { addDays, today } from "@/lib/dates";
import type { DashboardFilters, DrillRow } from "@/types/dashboard";

function defaultFilters(): DashboardFilters {
  const to = today();
  return { dateFrom: addDays(to, -89), dateTo: to, officeId: "", departmentId: "", partnerId: "", clientGroupId: "", staffCategory: "" };
}

type DrillState =
  | { kind: "fte"; title: string; extra: Record<string, string> }
  | { kind: "headcount"; title: string; params: { office_id?: string; staff_category?: string; designation?: string } }
  | null;

export default function Dashboards() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters());
  const [drill, setDrill] = useState<DrillState>(null);

  const officesQuery = useQuery({ queryKey: ["offices"], queryFn: fetchOffices, staleTime: 5 * 60_000 });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments, staleTime: 5 * 60_000 });
  const partnersQuery = useQuery({ queryKey: ["partners"], queryFn: fetchPartners, staleTime: 5 * 60_000 });
  const clientGroupsQuery = useQuery({ queryKey: ["client-groups"], queryFn: fetchClientGroups, staleTime: 5 * 60_000 });

  const c1 = useQuery({ queryKey: ["c1", filters.officeId], queryFn: () => fetchC1(filters) });
  const c2 = useQuery({ queryKey: ["c2", filters.officeId], queryFn: () => fetchC2(filters) });
  const c3 = useQuery({ queryKey: ["c3", filters], queryFn: () => fetchC3(filters) });
  const c4 = useQuery({ queryKey: ["c4", filters], queryFn: () => fetchC4(filters) });
  const c5 = useQuery({ queryKey: ["c5", filters], queryFn: () => fetchC5(filters) });
  const c6 = useQuery({ queryKey: ["c6", filters], queryFn: () => fetchC6(filters) });

  const drillFteQuery = useQuery({
    queryKey: ["drill", drill?.kind === "fte" ? drill.extra : null, filters],
    queryFn: () => (drill?.kind === "fte" ? fetchDrill(filters, drill.extra) : Promise.resolve([] as DrillRow[])),
    enabled: drill?.kind === "fte",
  });
  const drillHeadcountQuery = useQuery({
    queryKey: ["drill-headcount", drill?.kind === "headcount" ? drill.params : null],
    queryFn: () => (drill?.kind === "headcount" ? fetchDrillHeadcount(drill.params) : Promise.resolve([])),
    enabled: drill?.kind === "headcount",
  });

  return (
    <div className="flex h-screen flex-col">
      <DashboardFilterBar
        filters={filters}
        offices={officesQuery.data ?? []}
        departments={departmentsQuery.data ?? []}
        partners={partnersQuery.data ?? []}
        clientGroups={clientGroupsQuery.data ?? []}
        onChange={setFilters}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard id="c1" title="C1 · Headcount by location × category" chartKey="c1" filters={filters}>
            <C1Headcount
              rows={c1.data ?? []}
              onSegmentClick={(officeId, category) =>
                setDrill({ kind: "headcount", title: `Headcount — ${category}`, params: { office_id: officeId ?? undefined, staff_category: category } })
              }
            />
          </ChartCard>

          <ChartCard id="c2" title="C2 · Location × grade matrix" chartKey="c2" filters={filters}>
            <C2LocationGrade
              rows={c2.data ?? []}
              onCellClick={(officeId, designation) =>
                setDrill({ kind: "headcount", title: `Headcount — ${designation}`, params: { office_id: officeId ?? undefined, designation } })
              }
            />
          </ChartCard>

          <ChartCard id="c3" title="C3 · Partner-wise team allocated (FTE)" chartKey="c3" filters={filters}>
            <C3PartnerFte
              rows={c3.data ?? []}
              onSegmentClick={(partnerId, designation) =>
                setDrill({ kind: "fte", title: `Allocations — ${designation}`, extra: { partner_id: partnerId, designation } })
              }
            />
          </ChartCard>

          <ChartCard id="c4" title="C4 · Partner-wise portfolio" chartKey="c4" filters={filters}>
            <C4PartnerPortfolio
              rows={c4.data ?? []}
              onPointClick={(partnerId) => setDrill({ kind: "fte", title: "Portfolio allocations", extra: { partner_id: partnerId } })}
            />
          </ChartCard>

          <ChartCard id="c5" title="C5 · Domain/department-wise team allocated" chartKey="c5" filters={filters}>
            <C5DepartmentFte
              data={c5.data ?? { current: [], trend: [] }}
              onSliceClick={(deptId) => setDrill({ kind: "fte", title: "Department allocations", extra: deptId ? { department_id: deptId } : {} })}
            />
          </ChartCard>

          <ChartCard id="c6" title="C6 · Department × grade allocation" chartKey="c6" filters={filters}>
            <C6DepartmentGrade
              rows={c6.data ?? []}
              onSegmentClick={(deptId, designation) =>
                setDrill({
                  kind: "fte", title: `${designation} allocations`,
                  extra: { ...(deptId ? { department_id: deptId } : {}), designation },
                })
              }
            />
          </ChartCard>
        </div>
      </div>

      {drill?.kind === "fte" && (
        <DrillThroughModal title={drill.title} rows={drillFteQuery.data ?? []} loading={drillFteQuery.isLoading} onClose={() => setDrill(null)} />
      )}
      {drill?.kind === "headcount" && (
        <HeadcountDrillModal title={drill.title} rows={drillHeadcountQuery.data ?? []} loading={drillHeadcountQuery.isLoading} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
