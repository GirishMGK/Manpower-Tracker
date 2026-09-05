/** Deterministic department -> colour mapping (§6.1: "colour-coded by department"). */
const PALETTE = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#c026d3", "#65a30d", "#e11d48", "#0d9488",
];

export function colorForDepartment(departmentId: string | null | undefined): string {
  if (!departmentId) return "#64748b";
  let hash = 0;
  for (let i = 0; i < departmentId.length; i++) hash = (hash * 31 + departmentId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function violationColor(severity: "BLOCK" | "WARN" | "INFO" | null): string {
  if (severity === "BLOCK") return "#ef4444";
  if (severity === "WARN") return "#f59e0b";
  return "#22c55e";
}
