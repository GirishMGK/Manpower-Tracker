/** Small deterministic categorical palette shared by every dashboard chart. */
export const CHART_PALETTE = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#c026d3", "#65a30d", "#e11d48", "#0d9488",
  "#64748b", "#ca8a04", "#4f46e5", "#059669",
];

export function colorForKey(key: string, palette: string[] = CHART_PALETTE): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
