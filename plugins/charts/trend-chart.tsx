"use client"

import "./charts.css"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react"
import {
  Alert02Icon,
  ChartLineData01Icon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts"
import { react, useDelaySvgExport } from "tldraw"

import { cn } from "@/lib/utils"
import {
  Icon,
  numericValue,
  pointKey,
  useDataSources,
  usePointHistories,
  type LiveValue,
} from "@/sdk"

import type { ChartShape } from "./chart-shape"
import {
  bucketCountFor,
  decimalsFor,
  extentOf,
  fixedDomain,
  formatMoment,
  formatNumber,
  formatTick,
  layoutSeries,
  nearestTime,
  niceTicks,
  RANGES,
  rangeMs,
  refreshFor,
  runsOf,
  samplesFor,
  timeTicks,
  valueAt,
  type ChartSeries,
  type Pane,
  type Sample,
} from "./model"

/** Width of the value axis on the left; every pane shares it so times line up. */
const GUTTER = 40
const RIGHT = 14
const AXIS_H = 18
const LANE_H = 24

const colorOf = (series: Pick<ChartSeries, "slot">) =>
  `var(--series-${series.slot})`

// Recharts keeps axis settings in a store; props that change identity every render
// make it recompute ticks in a loop, so these stay constant.
// Room above the top tick for the unit label, and below the bottom tick for its text.
const PANE_MARGIN = { top: 18, right: RIGHT, bottom: 6, left: 0 }
const TICK_STYLE = { fontSize: 10 }

// ---- Hooks ------------------------------------------------------------------------------

/** Layout size (unaffected by canvas zoom). */
function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      setSize((prev) =>
        prev && prev.w === el.offsetWidth && prev.h === el.offsetHeight
          ? prev
          : { w: el.offsetWidth, h: el.offsetHeight }
      )
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function useNow(intervalMs: number, frozen: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (frozen) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, frozen])
  return now
}

interface Live {
  /** Values received while the chart is open (they extend the history). */
  tails: Record<string, { t: number; v: number | null }[]>
  latest: Record<string, LiveValue | undefined>
}

const MAX_TAIL = 2000

/** Watches every series' live value and keeps the ones that arrive. */
function useLive(series: readonly ChartSeries[]): Live {
  const sources = useDataSources()
  const [live, setLive] = useState<Live>({ tails: {}, latest: {} })
  const key = series.map(pointKey).join("\n\n")

  useEffect(() => {
    const refs = key
      ? key.split("\n\n").map((id) => {
          const [source, point] = id.split("\n")
          return { id, source: sources.find((s) => s.id === source), point }
        })
      : []
    const release = refs.flatMap((ref) =>
      ref.source ? [ref.source.watch(ref.point)] : []
    )
    const stop = react("chart live values", () => {
      const values = refs.map(
        (ref) => [ref.id, ref.source?.value(ref.point).get()] as const
      )
      setLive((prev) => {
        const tails = { ...prev.tails }
        const latest: Live["latest"] = {}
        for (const [id, value] of values) {
          latest[id] = value
          if (!value) continue
          // A station clock running ahead must not push samples past "now".
          const t = Math.min(value.timestamp ?? Date.now(), Date.now())
          const list = tails[id] ?? []
          if (list.length && list[list.length - 1].t >= t) continue
          tails[id] = [
            ...list.slice(1 - MAX_TAIL),
            { t, v: numericValue(value) },
          ]
        }
        return { tails, latest }
      })
    })
    return () => {
      stop()
      for (const done of release) done()
    }
  }, [key, sources])

  return live
}

// ---- Chart -------------------------------------------------------------------------------

/**
 * A trend: each unit gets its own pane (one value scale per plot), on/off points get
 * lanes, and every pane shares one time axis and one crosshair readout.
 */
export function TrendChart({
  shape,
  exporting = false,
}: {
  shape: ChartShape
  exporting?: boolean
}) {
  const { title, range, series } = shape.props
  const span = rangeMs(range)
  const plotRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(plotRef)
  const plotW = Math.max(1, (size?.w ?? shape.props.w) - GUTTER - RIGHT)
  const buckets = bucketCountFor(plotW)
  const histories = usePointHistories(
    series,
    span,
    buckets,
    refreshFor(span, buckets)
  )
  const live = useLive(series)
  // Scroll about two pixels at a time.
  const now = useNow(
    Math.min(Math.max((span / plotW) * 2, 1000), 60_000),
    exporting
  )
  const end = now
  const start = end - span
  const [hover, setHover] = useState<number | null>(null)

  const samples = useMemo(() => {
    const out = new Map<string, Sample[]>()
    for (const s of series) {
      const id = pointKey(s)
      const history = histories.get(id)
      // `end` advances on a timer, so a value that just arrived can be newer; it
      // shows on the next tick.
      const list = samplesFor(
        history?.buckets ?? null,
        history?.end ?? null,
        live.tails[id] ?? []
      ).filter((sample) => sample.t <= end)
      // The current value holds until now, so the line reaches the right edge.
      const current = live.latest[id]
      if (current && (!list.length || list[list.length - 1].t < end))
        list.push({ t: end, v: numericValue(current) })
      out.set(id, list)
    }
    return out
  }, [series, histories, live, end])

  const states = series.map((s) => histories.get(pointKey(s)))
  const offline = series.length > 0 && states.every((h) => h?.offline)
  const loading = states.some((h) => h?.loading)
  const error = states.find((h) => h?.error)?.error ?? null
  const hasData = [...samples.values()].some((list) => list.length > 0)

  // Exports wait until the history has loaded (or there is none to load).
  const exportReady = useDelaySvgExport()
  const ready = size !== null && !loading
  useEffect(() => {
    if (ready) exportReady()
  }, [ready, exportReady])

  // Points added before their first live value have no units yet; use the live
  // value's units for grouping and labels until then.
  const shown = useMemo(
    () =>
      series.map((s) =>
        s.units ? s : { ...s, units: live.latest[pointKey(s)]?.units ?? "" }
      ),
    [series, live.latest]
  )
  const { panes, lanes } = layoutSeries(shown)
  const stackH = size?.h ?? 0
  const paneArea = Math.max(0, stackH - AXIS_H - lanes.length * LANE_H)
  const paneH = panes.length ? Math.floor(paneArea / panes.length) : 0
  const xOf = (t: number) => GUTTER + ((t - start) / span) * plotW

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current
    if (!el || exporting) return
    const rect = el.getBoundingClientRect()
    // The canvas may be zoomed: convert screen pixels back to layout pixels.
    const x = (event.clientX - rect.left) / (rect.width / el.offsetWidth || 1)
    if (x < GUTTER || x > GUTTER + plotW) return setHover(null)
    const t = start + ((x - GUTTER) / plotW) * span
    setHover(nearestTime([...samples.values()], t))
  }

  const single = series.length === 1 ? series[0] : null
  const heading =
    title.trim() ||
    (single ? single.label : series.length ? "Trend" : "Trend chart")

  return (
    <div
      className={cn(
        "bas-chart flex size-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-surface]:outline-hidden"
      )}
      style={{ pointerEvents: "all" }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 pt-1">
        <span className="truncate text-xs font-medium">{heading}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {RANGES.find((r) => r.id === range)?.short}
        </span>
        <span className="flex-1" />
        {offline ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Icon icon={WifiDisconnected01Icon} className="size-3.5" />
            Not connected
          </span>
        ) : error ? (
          <span
            className="flex min-w-0 items-center gap-1 text-[11px] text-destructive"
            title={error}
          >
            <Icon icon={Alert02Icon} className="size-3.5" />
            <span className="truncate">History unavailable</span>
          </span>
        ) : null}
        {single ? <CurrentValue value={live.latest[pointKey(single)]} /> : null}
      </div>

      {series.length > 1 ? (
        <Legend series={series} latest={live.latest} />
      ) : null}

      <div
        ref={plotRef}
        className="relative min-h-0 flex-1"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {size && series.length ? (
          <>
            <div
              className={cn(
                "transition-opacity",
                loading && hasData && "opacity-60"
              )}
            >
              {panes.map((pane) => (
                <PaneChart
                  key={pane.units || "-"}
                  pane={pane}
                  width={size.w}
                  height={paneH}
                  start={start}
                  end={end}
                  samples={samples}
                  hover={hover}
                />
              ))}
              {lanes.map((s) => (
                <Lane
                  key={pointKey(s)}
                  series={s}
                  samples={samples.get(pointKey(s)) ?? []}
                  current={live.latest[pointKey(s)]}
                  end={end}
                  plotW={plotW}
                  xOf={xOf}
                />
              ))}
            </div>
            <TimeAxis start={start} end={end} plotW={plotW} xOf={xOf} />
            {hover !== null ? (
              <Readout
                at={hover}
                x={xOf(hover)}
                width={size.w}
                bottom={AXIS_H}
                span={span}
                series={[...panes.flatMap((p) => p.series), ...lanes]}
                samples={samples}
              />
            ) : null}
            {!hasData ? (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-[11px] text-muted-foreground">
                {offline
                  ? "Connect to a station to see history."
                  : loading
                    ? "Loading history…"
                    : "No history for this range."}
              </p>
            ) : null}
          </>
        ) : null}
        {!series.length ? <EmptyChart /> : null}
      </div>
    </div>
  )
}

function CurrentValue({ value }: { value: LiveValue | undefined }) {
  if (!value) return null
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs tabular-nums",
        value.statusKind === "alarm" && "text-destructive",
        value.statusKind === "override" && "text-amber-700 dark:text-amber-400"
      )}
      title={value.status}
    >
      {value.display}
    </span>
  )
}

function Legend({
  series,
  latest,
}: {
  series: readonly ChartSeries[]
  latest: Live["latest"]
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1 text-[11px]">
      {series.map((s) => (
        <span key={pointKey(s)} className="flex min-w-0 items-center gap-1.5">
          {/* The key mirrors the mark: a line for trends, a block for on/off lanes. */}
          <span
            className={cn(
              "shrink-0",
              s.kind === "boolean"
                ? "size-2 rounded-[2px]"
                : "h-0.5 w-3 rounded-full"
            )}
            style={{ background: colorOf(s) }}
          />
          <span className="truncate text-muted-foreground">{s.label}</span>
          <span className="shrink-0 font-mono tabular-nums">
            {latest[pointKey(s)]?.display ?? ""}
          </span>
        </span>
      ))}
    </div>
  )
}

function PaneChart({
  pane,
  width,
  height,
  start,
  end,
  samples,
  hover,
}: {
  pane: Pane
  width: number
  height: number
  start: number
  end: number
  samples: ReadonlyMap<string, Sample[]>
  hover: number | null
}) {
  const xDomain = useMemo<[number, number]>(() => [start, end], [start, end])
  // Round ticks of our own: Recharts' "nice" values can land on steps like 1.1.
  const tickCount = Math.max(3, Math.min(6, Math.floor(height / 26)))
  const extent =
    fixedDomain(pane.units) ??
    extentOf(
      pane.series.map((s) => samples.get(pointKey(s)) ?? []),
      start,
      end
    )
  const lo = extent?.[0] ?? null
  const hi = extent?.[1] ?? null
  const axis = useMemo(() => {
    if (lo === null || hi === null) return null
    const { ticks, step } = niceTicks(lo, hi, tickCount)
    const digits = decimalsFor(step)
    return {
      ticks,
      domain: [ticks[0], ticks[ticks.length - 1]] as [number, number],
      format: (value: number) =>
        value.toLocaleString(undefined, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
    }
  }, [lo, hi, tickCount])
  if (height < 24) return null
  // A lone series shows its min–max band; with several, bands would muddy each other.
  const band = pane.series.length === 1
  return (
    <div className="relative" style={{ height }}>
      {pane.units ? (
        <span className="absolute top-0 left-1.5 text-[10px] text-muted-foreground">
          {pane.units}
        </span>
      ) : null}
      <ComposedChart
        width={width}
        height={height}
        margin={PANE_MARGIN}
        accessibilityLayer={false}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          type="number"
          dataKey="t"
          domain={xDomain}
          allowDataOverflow
          hide
        />
        <YAxis
          width={GUTTER}
          domain={axis?.domain}
          ticks={axis?.ticks}
          allowDataOverflow
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tick={TICK_STYLE}
          interval={0}
          tickFormatter={axis?.format}
        />
        {pane.series.flatMap((s) => {
          const id = pointKey(s)
          const data = samples.get(id) ?? []
          const color = colorOf(s)
          const last = data[data.length - 1]
          const at = hover === null ? null : valueAt(data, hover)
          return [
            band ? (
              <Area
                key={`${id}-band`}
                data={data}
                dataKey="band"
                stroke="none"
                fill={color}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={false}
              />
            ) : null,
            <Line
              key={id}
              data={data}
              dataKey="v"
              type="linear"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />,
            last && last.v !== null && hover === null ? (
              <ReferenceDot
                key={`${id}-end`}
                x={last.t}
                y={last.v}
                r={4}
                fill={color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            ) : null,
            at !== null && hover !== null ? (
              <ReferenceDot
                key={`${id}-hover`}
                x={hover}
                y={at}
                r={4}
                fill={color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            ) : null,
          ]
        })}
      </ComposedChart>
    </div>
  )
}

function Lane({
  series,
  samples,
  current,
  end,
  plotW,
  xOf,
}: {
  series: ChartSeries
  samples: Sample[]
  current: LiveValue | undefined
  end: number
  plotW: number
  xOf(t: number): number
}) {
  const color = colorOf(series)
  return (
    <div className="relative" style={{ height: LANE_H }}>
      <span
        className="absolute top-0.5 truncate text-[10px] text-muted-foreground"
        style={{ left: GUTTER, right: RIGHT }}
      >
        {series.label}
        {current ? ` · ${current.display}` : ""}
      </span>
      <div
        className="absolute rounded-[2px] bg-muted"
        style={{ left: GUTTER, width: plotW, top: 14, height: 8 }}
      />
      {runsOf(samples, end).map((run) => {
        const left = Math.max(GUTTER, xOf(run.from))
        const right = Math.min(GUTTER + plotW, xOf(run.to))
        if (right <= left) return null
        return (
          <div
            key={run.from}
            className="absolute rounded-[2px]"
            style={{
              left,
              width: Math.max(1, right - left),
              top: 14,
              height: 8,
              background: color,
            }}
          />
        )
      })}
    </div>
  )
}

function TimeAxis({
  start,
  end,
  plotW,
  xOf,
}: {
  start: number
  end: number
  plotW: number
  xOf(t: number): number
}) {
  const { ticks, step } = timeTicks(
    start,
    end,
    Math.max(2, Math.floor(plotW / 72))
  )
  return (
    <div
      className="relative border-t border-border"
      style={{ height: AXIS_H, marginLeft: GUTTER, width: plotW }}
    >
      {ticks.map((t) => {
        const x = xOf(t) - GUTTER
        // Labels that would hang off either end are left out rather than clipped.
        if (x < 14 || x > plotW - 14) return null
        return (
          <span
            key={t}
            className="absolute top-0.5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums"
            style={{ left: x }}
          >
            {formatTick(t, step)}
          </span>
        )
      })}
    </div>
  )
}

/** Crosshair and one readout for every series at the hovered time. */
function Readout({
  at,
  x,
  width,
  bottom,
  span,
  series,
  samples,
}: {
  at: number
  x: number
  width: number
  bottom: number
  span: number
  series: readonly ChartSeries[]
  samples: ReadonlyMap<string, Sample[]>
}) {
  const onLeft = x > width * 0.6
  return (
    <>
      <div
        className="pointer-events-none absolute top-0 w-px bg-foreground/25"
        style={{ left: x, bottom }}
      />
      <div
        className="pointer-events-none absolute top-1 z-10 grid min-w-36 gap-1 rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
        style={onLeft ? { right: width - x + 10 } : { left: x + 10 }}
      >
        <span className="text-[11px] text-muted-foreground">
          {formatMoment(at, span)}
        </span>
        {series.map((s) => {
          const v = valueAt(samples.get(pointKey(s)) ?? [], at)
          const text =
            v === null
              ? "—"
              : s.kind === "boolean"
                ? v >= 0.5
                  ? "On"
                  : "Off"
                : `${formatNumber(v)}${s.units ? ` ${s.units}` : ""}`
          return (
            <span key={pointKey(s)} className="flex items-center gap-2">
              <span
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: colorOf(s) }}
              />
              <span className="font-medium tabular-nums">{text}</span>
              <span className="truncate text-muted-foreground">{s.label}</span>
            </span>
          )
        })}
      </div>
    </>
  )
}

function EmptyChart() {
  return (
    <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center">
      <Icon
        icon={ChartLineData01Icon}
        className="size-5 text-muted-foreground"
      />
      <p className="text-xs font-medium">Drop points here</p>
      <p className="text-[11px] text-muted-foreground">
        Drag points from the Station panel onto this chart.
      </p>
    </div>
  )
}
