// Trend chart logic: ranges, series colors, panes, samples, time ticks. Pure (no React,
// no DOM, relative imports only) so `node --test` can run it.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type ChartRange = "1h" | "8h" | "24h" | "7d" | "31d"

export const RANGES: readonly {
  id: ChartRange
  label: string
  short: string
  ms: number
}[] = [
  { id: "1h", label: "1 hour", short: "1 h", ms: HOUR },
  { id: "8h", label: "8 hours", short: "8 h", ms: 8 * HOUR },
  { id: "24h", label: "24 hours", short: "24 h", ms: DAY },
  { id: "7d", label: "7 days", short: "7 d", ms: 7 * DAY },
  { id: "31d", label: "31 days", short: "31 d", ms: 31 * DAY },
]

export const rangeMs = (range: ChartRange) =>
  RANGES.find((r) => r.id === range)?.ms ?? DAY

export type SeriesKind = "number" | "boolean"

export interface ChartSeries {
  source: string
  point: string
  label: string
  kind: SeriesKind
  /** Units when the point was added; groups series into panes. */
  units: string
  /** Categorical color slot (0–7). Kept with the series, so removing one never repaints the rest. */
  slot: number
}

/** Eight categorical colors; past that a chart should be split. */
export const MAX_SERIES = 8

/** The first color slot no series uses, or null when the chart is full. */
export function nextSlot(series: readonly Pick<ChartSeries, "slot">[]) {
  const used = new Set(series.map((s) => s.slot))
  for (let slot = 0; slot < MAX_SERIES; slot++) if (!used.has(slot)) return slot
  return null
}

export const sameSeries = (
  a: Pick<ChartSeries, "source" | "point">,
  b: Pick<ChartSeries, "source" | "point">
) => a.source === b.source && a.point === b.point

// ---- Layout ---------------------------------------------------------------------------

export interface Pane {
  units: string
  series: ChartSeries[]
}

/**
 * Numbers are grouped by units into stacked panes that share the time axis (one
 * scale per pane, never two scales on one plot); on/off points become lanes.
 */
export function layoutSeries(series: readonly ChartSeries[]): {
  panes: Pane[]
  lanes: ChartSeries[]
} {
  const panes: Pane[] = []
  const lanes: ChartSeries[] = []
  for (const s of series) {
    if (s.kind === "boolean") {
      lanes.push(s)
      continue
    }
    const units = s.units.trim()
    const pane = panes.find((p) => p.units === units)
    if (pane) pane.series.push(s)
    else panes.push({ units, series: [s] })
  }
  return { panes, lanes }
}

/** History detail by plot width, in a few fixed steps so resizing reuses requests. */
export function bucketCountFor(plotWidth: number) {
  if (plotWidth < 300) return 60
  if (plotWidth < 600) return 120
  if (plotWidth < 1200) return 240
  return 480
}

/** How often to reload history: once per bucket, between one and fifteen minutes. */
export function refreshFor(spanMs: number, buckets: number) {
  return Math.min(Math.max(spanMs / buckets, MINUTE), 15 * MINUTE)
}

/** Percentages read best on a fixed 0–100 scale; everything else fits its data. */
export function fixedDomain(units: string): [number, number] | null {
  return units.trim() === "%" ? [0, 100] : null
}

/** Round tick values (1, 2, 2.5 or 5 × 10ⁿ apart) covering `[min, max]`. */
export function niceTicks(min: number, max: number, count: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    return { ticks: [] as number[], step: 1 }
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / Math.max(1, count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ??
    10 * magnitude
  const ticks: number[] = []
  const first = Math.floor(min / step) * step
  for (let v = first; v < max + step * 0.999; v += step)
    ticks.push(Number(v.toFixed(10)))
  return { ticks, step }
}

/** Decimal places a tick step needs (0.25 → 2, 5 → 0). */
export function decimalsFor(step: number) {
  return (String(Number(step.toFixed(10))).split(".")[1] ?? "").length
}

/** Lowest and highest plotted values (including bands) inside the time window. */
export function extentOf(
  sampleSets: readonly (readonly Sample[])[],
  start: number,
  end: number
): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const samples of sampleSets) {
    for (const s of samples) {
      if (s.t < start || s.t > end) continue
      for (const v of s.band ? [s.v, ...s.band] : [s.v]) {
        if (v === null || !Number.isFinite(v)) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
  }
  return lo <= hi ? [lo, hi] : null
}

// ---- Samples --------------------------------------------------------------------------

export interface Bucket {
  t: number
  avg: number | null
  min: number | null
  max: number | null
}

export interface Sample {
  t: number
  v: number | null
  /** Bucket min/max, for the range band. */
  band?: [number, number]
}

/**
 * History buckets plotted at their centers, then live values that arrived after the
 * history window. A bucket without data is a gap.
 */
export function samplesFor(
  buckets: readonly Bucket[] | null,
  historyEnd: number | null,
  tail: readonly { t: number; v: number | null }[]
): Sample[] {
  const out: Sample[] = []
  const list = buckets ?? []
  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    const next = list[i + 1]?.t ?? historyEnd ?? b.t
    const center = b.t + Math.max(0, next - b.t) / 2
    out.push({
      t: center,
      v: b.avg,
      band: b.min !== null && b.max !== null ? [b.min, b.max] : undefined,
    })
  }
  const after = historyEnd ?? -Infinity
  for (const sample of tail) if (sample.t > after) out.push({ ...sample })
  return out.sort((a, b) => a.t - b.t)
}

/** The value showing at time `t`: the latest sample at or before it. */
export function valueAt(samples: readonly Sample[], t: number): number | null {
  let lo = 0
  let hi = samples.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found === -1) return null
  return samples[found].v
}

/** The sample time nearest to `t` across every series, so the crosshair snaps to data. */
export function nearestTime(
  sampleSets: readonly (readonly Sample[])[],
  t: number
): number | null {
  let best: number | null = null
  for (const samples of sampleSets) {
    for (const sample of samples) {
      if (best === null || Math.abs(sample.t - t) < Math.abs(best - t))
        best = sample.t
    }
  }
  return best
}

/** On periods of an on/off series (a bucket counts as on when it was on at least half the time). */
export function runsOf(
  samples: readonly Sample[],
  end: number
): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  let from: number | null = null
  for (let i = 0; i < samples.length; i++) {
    const on = samples[i].v !== null && samples[i].v! >= 0.5
    if (on && from === null) from = samples[i].t
    if (!on && from !== null) {
      runs.push({ from, to: samples[i].t })
      from = null
    }
  }
  if (from !== null) runs.push({ from, to: end })
  return runs
}

// ---- Time axis -----------------------------------------------------------------------

const STEPS = [
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
]

/** Tick step that fits at most `maxTicks` labels into the span. */
export function tickStep(spanMs: number, maxTicks: number) {
  return STEPS.find((step) => spanMs / step <= maxTicks) ?? 7 * DAY
}

/** Ticks on local-time boundaries (whole hours, midnights, Mondays). */
export function timeTicks(start: number, end: number, maxTicks: number) {
  const step = tickStep(end - start, Math.max(1, maxTicks))
  const first = new Date(start)
  first.setSeconds(0, 0)
  if (step >= DAY) {
    first.setHours(0, 0, 0, 0)
    if (step === 7 * DAY)
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  } else if (step >= HOUR) {
    first.setMinutes(0)
    first.setHours(first.getHours() - (first.getHours() % (step / HOUR)))
  } else {
    first.setMinutes(
      first.getMinutes() - (first.getMinutes() % (step / MINUTE))
    )
  }
  const ticks: number[] = []
  const cursor = new Date(first)
  while (cursor.getTime() <= end) {
    if (cursor.getTime() >= start) ticks.push(cursor.getTime())
    // Step in calendar units past an hour, so daylight-saving days stay aligned.
    if (step >= DAY) cursor.setDate(cursor.getDate() + step / DAY)
    else if (step >= HOUR) cursor.setHours(cursor.getHours() + step / HOUR)
    else cursor.setTime(cursor.getTime() + step)
  }
  return { ticks, step }
}

const pad = (n: number) => String(n).padStart(2, "0")
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** Axis label: time of day under a day, the weekday at midnight, dates past a week. */
export function formatTick(t: number, step: number) {
  const d = new Date(t)
  if (step >= 7 * DAY) return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (step >= DAY) return `${DAYS[d.getDay()]} ${d.getDate()}`
  if (d.getHours() === 0 && d.getMinutes() === 0) return DAYS[d.getDay()]
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Tooltip heading: always the time; the day too once the chart spans more than a day. */
export function formatMoment(t: number, spanMs: number) {
  const d = new Date(t)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return spanMs > DAY
    ? `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`
    : time
}

/** Compact number for ticks and readouts. */
export function formatNumber(value: number, spread = Math.abs(value)) {
  const digits = spread >= 100 ? 0 : spread >= 10 ? 1 : 2
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
