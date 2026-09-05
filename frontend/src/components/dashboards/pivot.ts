/** Pivot rows shaped {groupKey, seriesKey, value} into Recharts' wide format:
 * [{groupKey, [seriesA]: value, [seriesB]: value, ...}], plus the distinct
 * series keys found (for rendering one <Bar>/<Line> per series). */
export function pivotToWide<T extends Record<string, unknown>>(
  rows: T[],
  groupKey: keyof T,
  seriesKey: keyof T,
  valueKey: keyof T,
): { data: Record<string, unknown>[]; series: string[] } {
  const groups = new Map<string, Record<string, unknown>>();
  const seriesSet = new Set<string>();

  for (const row of rows) {
    const g = String(row[groupKey]);
    const s = String(row[seriesKey]);
    const v = Number(row[valueKey]) || 0;
    seriesSet.add(s);
    if (!groups.has(g)) groups.set(g, { [groupKey as string]: g });
    groups.get(g)![s] = v;
  }

  return { data: Array.from(groups.values()), series: Array.from(seriesSet).sort() };
}
