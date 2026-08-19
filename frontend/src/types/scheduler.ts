export type BoardStaff = {
  id: string;
  employee_code: string;
  full_name: string;
  staff_category: string;
  designation: string;
  grade_rank: number;
  base_office_id: string | null;
  primary_department_id: string | null;
  standard_hours_per_week: number;
};

export type BoardAllocation = {
  id: string;
  staff_id: string;
  engagement_id: string;
  engagement_code: string;
  client_name: string;
  department_id: string | null;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  status: string;
  booking_type: string;
  version: number;
};

export type BoardLeave = {
  id: string;
  staff_id: string;
  type: string;
  date_from: string;
  date_to: string;
  day_fraction: string;
  status: string;
};

export type BoardHoliday = {
  holiday_date: string;
  name: string;
  office_id: string | null;
};

export type BoardResponse = {
  staff: BoardStaff[];
  allocations: BoardAllocation[];
  leaves: BoardLeave[];
  holidays: BoardHoliday[];
};

export type EngagementLookupItem = {
  id: string;
  engagement_code: string;
  client_name: string;
  department_id: string;
  status: string;
  eqcr_partner_id: string | null;
};

export type Office = { id: string; code: string; name: string };
export type Department = { id: string; code: string; name: string };

export type RuleViolation = {
  code: string;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  context: Record<string, unknown>;
  overridable: boolean;
  override_role: string | null;
};

export type ValidateResponse = {
  is_blocked: boolean;
  violations: RuleViolation[];
};

export const ALLOCATION_ROLES = [
  "SIGNING_PARTNER", "ENGAGEMENT_PARTNER", "EQCR", "TECHNICAL_REVIEWER", "SPECIALIST",
  "ENGAGEMENT_MANAGER", "REPORTING_MANAGER", "FIELD_INCHARGE", "TEAM_MEMBER", "ARTICLE", "OBSERVER",
] as const;
