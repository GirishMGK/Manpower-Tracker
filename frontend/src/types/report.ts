export type ReportListItem = { key: string; title: string };

export type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  officeId: string;
  departmentId: string;
  partnerId: string;
  clientGroupId: string;
  staffCategory: string;
  status: string;
};

export type ReportRow = Record<string, string | number | boolean | null>;
