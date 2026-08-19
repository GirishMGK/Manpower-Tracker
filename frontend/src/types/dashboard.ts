export type DashboardFilters = {
  dateFrom: string;
  dateTo: string;
  officeId: string;
  departmentId: string;
  partnerId: string;
  clientGroupId: string;
  staffCategory: string;
};

export type HeadcountRow = {
  office_id: string | null;
  office_name: string;
  staff_category?: string;
  designation?: string;
  count: number;
};

export type PartnerFteRow = {
  partner_id: string;
  partner_name: string;
  designation: string;
  fte: number;
};

export type PartnerPortfolioRow = {
  partner_id: string;
  partner_name: string;
  fee_under_management: number;
  fte_deployed: number;
  engagement_count: number;
  avg_risk_score: number;
};

export type DepartmentFteRow = {
  department_id: string | null;
  department_name: string;
  fte: number;
};

export type DepartmentFteTrendRow = DepartmentFteRow & { month: string };

export type DepartmentFteResponse = {
  current: DepartmentFteRow[];
  trend: DepartmentFteTrendRow[];
};

export type DepartmentGradeRow = {
  department_id: string | null;
  department_name: string;
  designation: string;
  fte: number;
};

export type DrillRow = {
  allocation_id: string;
  staff_id: string;
  staff_name: string;
  designation: string;
  department_id: string | null;
  partner_id: string | null;
  engagement_id: string;
  engagement_code: string;
  client_id: string;
  client_name: string;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  fte: number;
};
