export type MeStaff = {
  employee_code: string;
  full_name: string;
  designation: string;
  staff_category: string;
  official_email: string | null;
  mobile: string | null;
  base_office_id: string | null;
  leave_entitlement_days: number | null;
};

export type MeProfile = {
  user_id: string;
  email: string;
  role: string;
  full_name: string;
  staff: MeStaff | null;
};

export type MeAllocation = {
  id: string;
  engagement_code: string;
  client_name: string;
  role_on_engagement: string;
  date_from: string;
  date_to: string;
  allocation_pct: number;
  status: string;
  work_location: string;
};

export type MeLeaveBalance = {
  financial_year_from: string;
  financial_year_to: string;
  entitlement_days: number | null;
  approved_days_taken: number;
  pending_days: number;
  remaining_days: number | null;
};

export type MeTimesheet = {
  id: string;
  engagement_id: string;
  work_date: string;
  hours: number;
  is_chargeable: boolean;
  status: string;
};
