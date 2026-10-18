// Reading an offline Metasys SCT archive (a SQL Server database restored from an SCT
// backup). Pure (no React, no DOM, relative imports only) so `node --test` can run it.
//
// The archive keeps every object as a row of dbo.Item (parent by parentItemID, the
// owning engine by DeviceItemID) typed by dbo.ItemDefinition (type, bacnetClassid).
// See docs/ARCHITECTURE.md (Metasys SCT) and MetAssist's research notes.

/** ItemDefinition.type values. */
export type SctItemType =
  | "archive"
  | "site"
  | "server"
  | "device"
  | "controller"
  | "folder"
  | "point"
  | "object"
  | "extension"
  | "integration"
  | "navList"

export type ValueKind = "number" | "boolean" | "text"

/** BACnet point classes by bacnetClassid (the same ids SCT uses). */
const POINT_CLASSES: Record<number, { short: string; kind: ValueKind }> = {
  0: { short: "AI", kind: "number" },
  1: { short: "AO", kind: "number" },
  2: { short: "AV", kind: "number" },
  3: { short: "BI", kind: "boolean" },
  4: { short: "BO", kind: "boolean" },
  5: { short: "BV", kind: "boolean" },
  13: { short: "MI", kind: "text" },
  14: { short: "MO", kind: "text" },
  19: { short: "MV", kind: "text" },
}

/** "AI", "BO", "MV"… for a point class; null for anything that isn't a point value. */
export const pointShort = (classId: number | null) =>
  classId === null ? null : (POINT_CLASSES[classId]?.short ?? null)

/** How a point's value reads: a number, on/off, or a state (multistate). */
export const kindOfClass = (classId: number | null): ValueKind | null =>
  classId === null ? null : (POINT_CLASSES[classId]?.kind ?? null)

/** A row of the tree as it comes from SQL. */
export interface ItemRow {
  itemID: number
  parentItemID: number | null
  DeviceItemID: number | null
  PartialReference: string | null
  UserName: string | null
  ObjectId: string | null
  type: string
  bacnetClassid: number | null
  itemDefName: string
  /** Children (live ones), counted in the query. */
  childCount: number
}

/** Engines and servers own references: their PartialReference is "SITE:NAME". */
export const ownsReferences = (type: string) =>
  type === "server" || type === "device"

/**
 * What the network tree leaves out: folders an engine keeps for other views
 * (equipment, definitions, graphics…) or for SCT's own bookkeeping ($-prefixed),
 * alarm and trend extensions (they belong to their object), and objects of other
 * views (spaces, equipment, graphics, resource files). Equipment and spaces will get
 * their own tabs. Mirrored in SQL by the hub so child counts agree.
 */
export const NOT_NETWORK_FOLDERS = [
  "equipment",
  "definitions",
  "Graphics",
  "Trend Studies",
]
export const NOT_NETWORK_TYPES = ["extension", "navList"]
/** Equipment, Space, Definition, Facility Graphic, resource file, SCT's config site and its dummy device. */
export const NOT_NETWORK_CLASSES = [805, 806, 807, 844, 847, 2004, 2009]

export function inNetworkTree(
  row: Pick<ItemRow, "type" | "PartialReference"> &
    Partial<Pick<ItemRow, "bacnetClassid">>
) {
  if (NOT_NETWORK_TYPES.includes(row.type)) return false
  if (
    row.bacnetClassid != null &&
    NOT_NETWORK_CLASSES.includes(row.bacnetClassid)
  )
    return false
  if (row.type === "site") return true
  const ref = row.PartialReference ?? ""
  if (
    row.type === "folder" &&
    NOT_NETWORK_FOLDERS.some((name) => name.toLowerCase() === ref.toLowerCase())
  )
    return false
  if (ref.startsWith("$") || ref.includes(".$")) return false
  return true
}

/** The last segment of a dotted reference: "FC-2.012074FEC.OA-T" → "OA-T". */
export function shortName(ref: string | null): string {
  if (!ref) return ""
  const afterColon = ref.includes(":") ? ref.slice(ref.indexOf(":") + 1) : ref
  return afterColon.split(".").pop() ?? afterColon
}

/** What a node shows: its own name (the reference's last part), not the long display path. */
export function nodeName(
  row: Pick<ItemRow, "PartialReference" | "UserName" | "type">
) {
  if (row.type === "site" || row.type === "archive")
    return row.UserName || row.PartialReference || "Site"
  const fromRef = shortName(row.PartialReference)
  if (fromRef) return fromRef
  const user = row.UserName ?? ""
  return user.split(".").pop() || user || "Item"
}

/**
 * The fully qualified reference Metasys uses: the owning engine's reference, a slash,
 * then the item's own reference ("CJAXMETASYS:NAE55-01/FC-2.012074FEC.OA-T"). Engines
 * are their own reference.
 */
export function fqrOf(itemRef: string, deviceRef: string | null) {
  return deviceRef && deviceRef !== itemRef
    ? `${deviceRef}/${itemRef}`
    : itemRef
}

/** Splits an FQR back into the engine's reference and the item's own. */
export function splitFqr(fqr: string): { device: string | null; item: string } {
  const slash = fqr.indexOf("/")
  if (slash < 0) return { device: null, item: fqr }
  return { device: fqr.slice(0, slash), item: fqr.slice(slash + 1) }
}

/**
 * A stored attribute value as a typed value for its point kind. SCT keeps values as
 * text; enums are "set.member" ("33.0"), booleans as 0/1 or false/true.
 */
export function parseStored(
  text: string | null,
  kind: ValueKind | null
): boolean | number | string | null {
  if (text === null) return null
  const t = text.trim()
  if (!t || t === "xsi:nil") return null
  if (kind === "number") {
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  if (kind === "boolean") {
    if (/^(1|true|on|active)$/i.test(t)) return true
    if (/^(0|false|off|inactive)$/i.test(t)) return false
    // Enum form "set.member": member 1 is the active state.
    const member = Number(t.split(".").pop())
    return Number.isFinite(member) ? member === 1 : null
  }
  return t
}

/** BACnet engineering units by id (the common ones in buildings). */
const UNITS: Record<number, string> = {
  2: "mA",
  3: "A",
  5: "V",
  19: "kWh",
  27: "Hz",
  29: "%RH",
  47: "W",
  48: "kW",
  53: "Pa",
  54: "kPa",
  56: "psi",
  58: "inH₂O",
  62: "°C",
  63: "K",
  64: "°F",
  71: "h",
  72: "min",
  73: "s",
  77: "fpm",
  84: "cfm",
  87: "L/s",
  89: "gpm",
  96: "ppm",
  98: "%",
  104: "rpm",
}

/** Units from a stored Units attribute ("507.98": the units enum set, member 98). */
export function unitsOf(text: string | null): string | null {
  const member = Number(text?.trim().split(".").pop())
  return Number.isInteger(member) ? (UNITS[member] ?? null) : null
}

/** How a stored value reads. */
export function displayStored(
  value: boolean | number | string | null,
  units: string | null
) {
  if (value === null) return "—"
  if (typeof value === "boolean") return value ? "On" : "Off"
  if (typeof value === "number") {
    const text = Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 100) / 100)
    return units ? `${text} ${units}` : text
  }
  return value
}

/** A database name we're willing to put into a USE-free connection (no injection risk). */
export const isDatabaseName = (name: string) =>
  /^[\w$#@. -]{1,128}$/.test(name) && !/^\s|\s$/.test(name)

/** The data source id for an archive: stable across restores and server moves. */
export const sourceIdFor = (database: string) => `sct:${database}`
