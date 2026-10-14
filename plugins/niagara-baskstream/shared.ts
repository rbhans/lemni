// Types shared by the browser and the server side of the Niagara plugin.
// Nothing here may import server-only modules.

/** What gets remembered between sessions. Never contains a password. */
export interface StationProfile {
  name: string
  /** Station base URL, e.g. https://10.0.0.20 */
  station: string
  username: string
  /** Accept a self-signed certificate. Turns off certificate checks for this connection. */
  allowSelfSigned: boolean
}

export interface ConnectRequest extends StationProfile {
  password: string
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected"

export interface ConnectionInfo {
  id: string
  name: string
  /** Origin only (scheme, host, port). */
  station: string
  username: string
  status: ConnectionStatus
  apiVersion: string | null
  writesEnabled: boolean
  allowSelfSigned: boolean
  /** Latest problem worth showing, if any. */
  message: string | null
  livePoints: number
}

export interface StationNode {
  ord: string
  name: string
  display: string
  kind: string
  typeSpec: string
  hasChildren: boolean
  writable: boolean
  features: string[]
  status: string | null
}

export interface PointDetails extends StationNode {
  description: string | null
  units: string | null
  precision: number | null
  activeLevel: number | null
  parent: { ord: string; display: string } | null
  hasHistory: boolean
}

export interface PointValue {
  point: string
  ok: boolean
  value: unknown
  display: string
  status: string
  timestamp: number | null
  valueType: string | null
  units: string | null
  code: string | null
  message: string | null
}

export interface HistoryBucket {
  t: number
  avg: number | null
  min: number | null
  max: number | null
}

export interface StationAlarm {
  uuid: string
  timestamp: number | null
  priority: number | null
  alarmClass: string | null
  sourceState: string | null
  ackState: string | null
  source: string | null
  message: string
}

/** Point writes Lemni sends: fallback (set), priority 8 (override), or release (auto). */
export type WriteAction = "set" | "override" | "auto"

export interface PointWrite {
  point: string
  action: WriteAction
  /** Required for set and override; none for auto. */
  value?: boolean | number | string
  /** Timed override, in seconds (override only). */
  durationSec?: number
}

/** What the station says a point accepts (describe_write). */
export interface WriteInfo {
  point: string
  writable: boolean
  actions: string[]
  valueKind: string | null
  supportsDuration: boolean
  enumOptions: string[]
}

export interface WriteResult {
  point: string
  ok: boolean
  error?: string
  /** Read back after the write (a higher priority may still win). */
  after?: PointValue
}

export type LiveEvent =
  | { type: "values"; points: PointValue[] }
  | { type: "status"; connection: ConnectionInfo }

/** Status flags parsed from a Niagara status string such as "{overridden} @ 8". */
export type StatusKind =
  | "ok"
  | "alarm"
  | "fault"
  | "down"
  | "stale"
  | "disabled"
  | "override"
  | "unknown"

export function statusKind(
  status: string | null | undefined,
  ok = true
): StatusKind {
  if (!status) return ok ? "ok" : "unknown"
  const s = status.toLowerCase()
  if (s.includes("fault")) return "fault"
  if (s.includes("down")) return "down"
  if (s.includes("disabled")) return "disabled"
  if (s.includes("stale")) return "stale"
  if (s.includes("alarm") || s.includes("unackedalarm")) return "alarm"
  if (s.includes("overridden") || /@\s*\d+/.test(s)) return "override"
  return ok ? "ok" : "unknown"
}

/** Priority level from "{overridden} @ 8", if present. */
export function activeLevelOf(
  status: string | null | undefined
): number | null {
  const match = /@\s*(\d+)/.exec(status ?? "")
  return match ? Number(match[1]) : null
}
