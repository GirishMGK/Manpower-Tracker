/** Pure display-formatting helpers for the /me page — split out from the
 * component so they're unit-testable without rendering React. */
import type { MeLeaveBalance } from "@/types/me";

export function formatDateRange(dateFrom: string, dateTo: string): string {
  return dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;
}

export function leaveBalanceSummary(balance: MeLeaveBalance): string {
  if (balance.entitlement_days == null) {
    return `${balance.approved_days_taken} day(s) taken this FY (no entitlement set)`;
  }
  const remaining = balance.remaining_days ?? balance.entitlement_days - balance.approved_days_taken;
  return `${remaining} of ${balance.entitlement_days} day(s) remaining this FY`;
}

export function isUpcoming(dateFrom: string, today: string): boolean {
  return dateFrom >= today;
}
