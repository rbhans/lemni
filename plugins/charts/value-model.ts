// Single-value widgets (stat tile, gauge): change, on-time, ranges, limits and dial
// geometry. Pure (no React, no DOM, relative imports only) so `node --test` can run it.

import { niceTicks, type Sample } from "./model.ts"

export type UpIs = "neutral" | "good" | "bad"

/** Change from the first value in the window to now, or null without both. */
export function changeOver(
  samples: readonly Sample[],
  current: number | null
): number | null {
  if (current === null) return null
  const first = samples.find((s) => s.v !== null)?.v ?? null
  return first === null ? null : current - first
}

/** Whether a change reads as good, bad or neither, given which way is good. */
export function changeTone(
  change: number | null,
  upIs: UpIs
): "good" | "bad" | "neutral" {
  if (change === null || change === 0 || upIs === "neutral") return "neutral"
  const up = change > 0
  return up === (upIs === "good") ? "good" : "bad"
}

/** Share of the window an on/off point spent on (buckets roll up as 0–1). */
export function onShare(samples: readonly Sample[]): number | null {
  const values = samples.flatMap((s) => (s.v === null ? [] : [s.v]))
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** A starting scale for a new gauge: 0–100 for %, a band around temperatures, else 0 up. */
export function defaultGaugeRange(
  units: string,
  value: number | null
): [number, number] {
  const u = units.trim()
  if (u === "%") return [0, 100]
  if (value === null || !Number.isFinite(value)) return [0, 100]
  if (/°/.test(u)) {
    const lo = Math.floor((value - 20) / 10) * 10
    return [lo, lo + 50]
  }
  const top = Math.max(Math.abs(value) * 1.5, 1)
  const { ticks } = niceTicks(0, top, 5)
  return value < 0
    ? [-ticks[ticks.length - 1], 0]
    : [0, ticks[ticks.length - 1]]
}

export interface Limits {
  alarmLow: number | null
  warnLow: number | null
  warnHigh: number | null
  alarmHigh: number | null
}

export type Severity =
  | { level: "normal" }
  | { level: "warning" | "alarm"; side: "low" | "high"; limit: number }

/** Where a value sits against its limits; alarm limits win over warnings. */
export function severityOf(value: number | null, limits: Limits): Severity {
  if (value === null) return { level: "normal" }
  if (limits.alarmHigh !== null && value >= limits.alarmHigh)
    return { level: "alarm", side: "high", limit: limits.alarmHigh }
  if (limits.alarmLow !== null && value <= limits.alarmLow)
    return { level: "alarm", side: "low", limit: limits.alarmLow }
  if (limits.warnHigh !== null && value >= limits.warnHigh)
    return { level: "warning", side: "high", limit: limits.warnHigh }
  if (limits.warnLow !== null && value <= limits.warnLow)
    return { level: "warning", side: "low", limit: limits.warnLow }
  return { level: "normal" }
}

/** Position of a value on the scale, clamped to 0–1. */
export function fractionOf(value: number, min: number, max: number) {
  if (!(max > min)) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

/** The dial spans 240°, from 120° left of straight up to 120° right of it. */
export const DIAL_SWEEP = 240

/** Angle (degrees clockwise from 12 o'clock) for a 0–1 position on the dial. */
export const dialAngle = (fraction: number) =>
  -DIAL_SWEEP / 2 + fraction * DIAL_SWEEP

export function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** SVG path for a clockwise arc between two dial angles. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number
) {
  if (to - from < 0.01) return ""
  const a = polar(cx, cy, r, from)
  const b = polar(cx, cy, r, to)
  const large = to - from > 180 ? 1 : 0
  const f = (n: number) => Number(n.toFixed(2))
  return `M ${f(a.x)} ${f(a.y)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(b.x)} ${f(b.y)}`
}

/** Splits "58.4 °F" into the number and its units, so they can be sized differently. */
export function splitDisplay(display: string, units: string | null) {
  const u = units?.trim()
  if (u && display.endsWith(u) && display.length > u.length)
    return { main: display.slice(0, -u.length).trim(), units: u }
  return { main: display, units: "" }
}
