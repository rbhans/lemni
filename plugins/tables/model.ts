// Live table logic: equipment inference, pivoting and CSV. Pure (no React, no DOM,
// relative imports only) so `node --test` can run it.

export interface TableRowRef {
  source: string
  point: string
  label: string
}

export type TableLayout = "list" | "equipment"

export interface TableColumns {
  equipment: boolean
  status: boolean
  updated: boolean
}

export const sameRow = (
  a: Pick<TableRowRef, "source" | "point">,
  b: Pick<TableRowRef, "source" | "point">
) => a.source === b.source && a.point === b.point

/** Niagara escapes characters in slot names as `$xx` (e.g. `$2d` is "-"). */
export function unescapeSlot(name: string) {
  return name.replace(/\$([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )
}

/**
 * The equipment a point belongs to, read from its path: the folder that holds a
 * `points` folder (".../AHU_1/points/DA-T"), else the point's parent folder.
 */
export function equipmentOf(point: string): string {
  const parts = point
    .replace(/^[a-z]+:\/?/i, "")
    .split("/")
    .filter(Boolean)
  const pointsAt = parts.lastIndexOf("points")
  const owner =
    pointsAt > 0
      ? parts[pointsAt - 1]
      : parts.length > 1
        ? parts[parts.length - 2]
        : ""
  return unescapeSlot(owner)
}

export interface Pivot {
  equipment: string[]
  /** Point names in the order they first appear. */
  names: string[]
  cell(equipment: string, name: string): TableRowRef | undefined
}

/** Rows are equipment, columns are point names (e.g. every VAV's space temp side by side). */
export function pivotByEquipment(rows: readonly TableRowRef[]): Pivot {
  const equipment: string[] = []
  const names: string[] = []
  const cells = new Map<string, TableRowRef>()
  for (const row of rows) {
    const eq = equipmentOf(row.point)
    if (!equipment.includes(eq)) equipment.push(eq)
    if (!names.includes(row.label)) names.push(row.label)
    const key = `${eq}\n${row.label}`
    if (!cells.has(key)) cells.set(key, row)
  }
  return {
    equipment,
    names,
    cell: (eq, name) => cells.get(`${eq}\n${name}`),
  }
}

/**
 * Splits rows into groups of similar equipment: units whose point names mostly match
 * (all the VAVs, say) go together; a lone AHU gets its own group. Order follows the
 * rows.
 */
export function groupByEquipmentKind(
  rows: readonly TableRowRef[]
): TableRowRef[][] {
  const byUnit = new Map<string, TableRowRef[]>()
  for (const row of rows) {
    const eq = equipmentOf(row.point)
    byUnit.set(eq, [...(byUnit.get(eq) ?? []), row])
  }
  const groups: { names: Set<string>; rows: TableRowRef[] }[] = []
  for (const unitRows of byUnit.values()) {
    const names = new Set(unitRows.map((r) => r.label))
    const similar = groups.find((g) => overlap(g.names, names) >= 0.5)
    if (similar) {
      similar.rows.push(...unitRows)
      for (const n of names) similar.names.add(n)
    } else groups.push({ names, rows: [...unitRows] })
  }
  return groups.map((g) => g.rows)
}

/** Shared names over all names (Jaccard). */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  let shared = 0
  for (const n of a) if (b.has(n)) shared++
  return shared / (a.size + b.size - shared || 1)
}

/** True when grouping by equipment adds something: several units sharing point names. */
export function looksLikeEquipment(rows: readonly TableRowRef[]) {
  const pivot = pivotByEquipment(rows)
  return pivot.equipment.length > 1 && pivot.names.length < rows.length
}

// ---- CSV ------------------------------------------------------------------------------

/**
 * One CSV field. Values starting with a formula character are prefixed so a
 * spreadsheet shows them as text instead of running them (point names come from
 * the station, so they are not trusted).
 */
export function csvField(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ""
  let text = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n"
}

/** "12 s", "4 min", "3 h", "2 d" since a timestamp. */
export function age(timestamp: number | null, now: number) {
  if (timestamp === null) return ""
  const s = Math.max(0, Math.round((now - timestamp) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} d`
}
