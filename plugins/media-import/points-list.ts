// Points lists: a sheet whose rows name points (an ORD, a path, or a point name with its
// equipment), matched to the points of a connected station. Pure (no React, no DOM,
// relative imports only) so `node --test` can run it; searching is handed in.

/** A point a connected source found. */
export interface PointCandidate {
  source: string
  point: string
  label: string
  /** Where it lives, e.g. "Drivers/BacnetNetwork/AHU_1/points". */
  path: string
  kind: "boolean" | "number" | "text" | null
}

/** What to look for, per data row. */
export interface PointQuery {
  /** The point's own name (the last part of a path). */
  name: string
  /** Its full id when the row gave one (a Niagara ORD, a Metasys FQR). */
  id: string | null
  /** Equipment or folders it should sit under ("AHU-1"). */
  context: string[]
}

export interface PointsList {
  /** The column naming each row's point. */
  pointColumn: number
  /** The column naming its equipment, when there is one. */
  equipmentColumn: number | null
  /** One per data row that names a point. */
  queries: PointQuery[]
}

/**
 * Lower case, letters and digits only, numbers without leading zeros: "DA-T", "da_t"
 * and "DA T" are the same name, and so are "VAV-2-1" and "VAV_2_01".
 */
export const normalizeName = (text: string) =>
  text
    .toLowerCase()
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""))
    .replace(/[^a-z0-9]/g, "")

const ID_HEADINGS = new Set([
  "ord",
  "slotord",
  "slotpath",
  "slot",
  "path",
  "pointpath",
  "fqr",
  "reference",
  "objectreference",
  "itemreference",
])
const POINT_HEADINGS = new Set(["point", "pointname", "points"])
const NAME_HEADINGS = new Set([
  "name",
  "object",
  "objectname",
  "tag",
  "tagname",
  "pointid",
  "id",
])
/** Headings that only appear beside points: a generic Name or Tag column needs one. */
const POINT_DETAIL_HEADINGS = new Set([
  "units",
  "uom",
  "engineeringunits",
  "type",
  "pointtype",
  "objecttype",
  "value",
  "presentvalue",
  "kind",
  "address",
  "instance",
  "objectinstance",
  "io",
])
const EQUIPMENT_HEADINGS = new Set([
  "equipment",
  "equip",
  "device",
  "devicename",
  "unit",
  "controller",
  "system",
  "asset",
  "parent",
])

const isOrd = (text: string) => /(^|\|)slot:\//.test(text)
/** A Metasys fully qualified reference: SITE:ENGINE/TRUNK.DEVICE.POINT */
const isFqr = (text: string) => /^[^\s:/]+:[^\s:/]+[/.][^\s]+$/.test(text)
/** Looks like a reference to a point, not a sentence: no spaces, a path or a dotted name. */
const looksLikeReference = (text: string) =>
  isOrd(text) || isFqr(text) || (/^[^\s]+$/.test(text) && /[/.\-_]/.test(text))

/** "station:|slot:/A/B" → "slot:/A/B". */
const ordOf = (text: string) => text.slice(text.indexOf("slot:/"))

/** Niagara escapes characters in slot names: "DA$2dT" is "DA-T". */
const unescapeSlot = (name: string) =>
  name.replace(/\$([0-9a-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  )

function headingScore(heading: string): number {
  const name = normalizeName(heading)
  if (ID_HEADINGS.has(name)) return 3
  if (POINT_HEADINGS.has(name)) return 2.5
  if (NAME_HEADINGS.has(name)) return 2
  return 0
}

/** The query for one cell (plus the row's equipment, when the sheet has a column for it). */
export function queryFor(cell: string, equipment: string | null): PointQuery {
  const text = cell.trim()
  const context = equipment?.trim() ? [equipment.trim()] : []
  if (isOrd(text)) {
    const id = ordOf(text)
    const parts = id
      .slice("slot:/".length)
      .split("/")
      .filter(Boolean)
      .map(unescapeSlot)
    return {
      name: parts.at(-1) ?? id,
      id,
      context: [...context, ...parts.slice(0, -1)],
    }
  }
  if (isFqr(text)) {
    const name = text.split(/[/.]/).at(-1) ?? text
    return { name, id: text, context }
  }
  if (text.includes("/")) {
    const parts = text.split("/").filter(Boolean)
    return {
      name: parts.at(-1) ?? text,
      id: null,
      context: [...context, ...parts.slice(0, -1)],
    }
  }
  return { name: text, id: null, context }
}

/**
 * Whether a sheet (headings in the first row) reads as a points list, and which
 * column names the points, filled in on most rows: one headed ORD, Path or Point, one
 * holding ORDs, or a generic Name or Tag column whose cells are paths or that sits
 * beside a points-only heading (Units, Object type, …). An equipment list with a Tag
 * column isn't one.
 */
export function readPointsList(
  rows: readonly (readonly string[])[]
): PointsList | null {
  const [head, ...body] = rows
  if (!head || !body.length) return null
  const filled = (column: number) =>
    body.map((row) => (row[column] ?? "").trim()).filter(Boolean)
  const pointDetails = head.some((heading) =>
    POINT_DETAIL_HEADINGS.has(normalizeName(heading ?? ""))
  )
  let best: { column: number; score: number } | null = null
  for (let column = 0; column < head.length; column++) {
    const cells = filled(column)
    if (cells.length < body.length * 0.5) continue
    const heading = headingScore(head[column] ?? "")
    const references = cells.filter(looksLikeReference).length / cells.length
    const paths =
      cells.filter((cell) => /[/]/.test(cell) || isFqr(cell)).length /
      cells.length
    const ords = cells.some(isOrd)
    const generic = heading > 0 && heading < 2.5
    if (!ords && (heading === 0 || (generic && paths < 0.5 && !pointDetails)))
      continue
    const score = heading + references * 2 + (ords ? 3 : 0)
    if (!best || score > best.score) best = { column, score }
  }
  if (!best) return null
  const pointColumn = best.column
  const found = head.findIndex(
    (heading, column) =>
      column !== pointColumn &&
      EQUIPMENT_HEADINGS.has(normalizeName(heading ?? ""))
  )
  const equipmentColumn = found >= 0 ? found : null
  const queries = body.flatMap((row) => {
    const cell = (row[pointColumn] ?? "").trim()
    const equipment =
      equipmentColumn === null ? null : (row[equipmentColumn] ?? null)
    return cell ? [queryFor(cell, equipment)] : []
  })
  return queries.length ? { pointColumn, equipmentColumn, queries } : null
}

/** Whether a candidate sits under the given equipment or folders (whole names only). */
function underContext(candidate: PointCandidate, context: string[]) {
  const segments = candidate.path.split(/[/.]/).map(normalizeName)
  return context.every((part) => {
    const wanted = normalizeName(part)
    return !wanted || segments.includes(wanted)
  })
}

/** The one candidate a query means, or why there isn't one. */
export function pickCandidate(
  query: PointQuery,
  candidates: readonly PointCandidate[]
): PointCandidate | "missing" | "ambiguous" {
  if (query.id) {
    const exact = candidates.filter((c) => c.point === query.id)
    if (exact.length === 1) return exact[0]
  }
  const name = normalizeName(query.name)
  const named = candidates.filter((c) => normalizeName(c.label) === name)
  if (!named.length) return "missing"
  if (named.length === 1 && !query.context.length) return named[0]
  // Narrow by equipment. A lone point of that name still counts when its folders are
  // named differently ("AHU 1 Main" for AHU-1).
  const under = named.filter((c) => underContext(c, query.context))
  if (under.length === 1) return under[0]
  if (under.length > 1) return "ambiguous"
  return named.length === 1 ? named[0] : "ambiguous"
}

export interface MatchResult {
  /** In row order, each point once. */
  matched: PointCandidate[]
  missing: number
  ambiguous: number
  /** Rows left out past the limit. */
  skipped: number
}

/**
 * Matches each row to a point. `search` is asked once per distinct point name (a
 * points list repeats names across equipment), a few at a time.
 */
export async function matchPoints(
  queries: readonly PointQuery[],
  search: (name: string) => Promise<PointCandidate[]>,
  { limit = 300, concurrency = 4 } = {}
): Promise<MatchResult> {
  const used = queries.slice(0, limit)
  const names = [...new Set(used.map((q) => q.name))]
  const found = new Map<string, PointCandidate[]>()
  let next = 0
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++]
      found.set(name, await search(name).catch(() => []))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, names.length) }, worker)
  )

  const matched: PointCandidate[] = []
  const seen = new Set<string>()
  let missing = 0
  let ambiguous = 0
  for (const query of used) {
    const pick = pickCandidate(query, found.get(query.name) ?? [])
    if (pick === "missing") missing++
    else if (pick === "ambiguous") ambiguous++
    else {
      const key = `${pick.source}\n${pick.point}`
      if (!seen.has(key)) {
        seen.add(key)
        matched.push(pick)
      }
    }
  }
  return { matched, missing, ambiguous, skipped: queries.length - used.length }
}
