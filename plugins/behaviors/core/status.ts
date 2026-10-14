// Niagara-style status strings → a small set of kinds. Pure.

export type StatusKind =
  | "ok"
  | "alarm"
  | "fault"
  | "down"
  | "stale"
  | "disabled"
  | "override"
  | "unknown"

export function statusKindOf(
  status: string | undefined,
  ok = true
): StatusKind {
  if (!status) return ok ? "ok" : "unknown"
  const s = status.toLowerCase()
  if (s.includes("fault")) return "fault"
  if (s.includes("down")) return "down"
  if (s.includes("disabled")) return "disabled"
  if (s.includes("stale")) return "stale"
  if (s.includes("alarm")) return "alarm"
  if (s.includes("overridden") || /@\s*\d+/.test(s)) return "override"
  return ok ? "ok" : "unknown"
}
