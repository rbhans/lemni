"use client"

import "./charts.css"

import { useEffect, useMemo } from "react"
import {
  Alert02Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
} from "@hugeicons/core-free-icons"
import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useDelaySvgExport,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { cn } from "@/lib/utils"
import {
  Icon,
  numericValue,
  pointKey,
  registerShapeLabel,
  useLivePoint,
  usePointHistories,
  type LiveValue,
} from "@/sdk"

import {
  formatNumber,
  RANGES,
  rangeMs,
  refreshFor,
  runsOf,
  samplesFor,
  type ChartRange,
  type Sample,
} from "./model"
import {
  EMPTY_POINT,
  valuePointValidators,
  type ValuePointProps,
} from "./value-props"
import {
  changeOver,
  changeTone,
  onShare,
  splitDisplay,
  type UpIs,
} from "./value-model"

export const STAT_TYPE = "bas-stat"

export interface StatShapeProps extends ValuePointProps {
  w: number
  h: number
  /** Empty: the point's name. */
  title: string
  /** Window for the change and the sparkline. */
  range: ChartRange
  /** Colors the change: green when it moves the good way, red the other. */
  upIs: UpIs
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [STAT_TYPE]: StatShapeProps
  }
}

export type StatShape = TLShape<typeof STAT_TYPE>

export const isStatShape = (
  shape: TLShape | undefined | null
): shape is StatShape => shape?.type === STAT_TYPE

registerShapeLabel(STAT_TYPE, () => "Stat tile")

const HISTORY_BUCKETS = 60

export class StatShapeUtil extends ShapeUtil<StatShape> {
  static override type = STAT_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    range: T.literalEnum("1h", "8h", "24h", "7d", "31d"),
    upIs: T.literalEnum("neutral", "good", "bad"),
    ...valuePointValidators,
  }

  getDefaultProps(): StatShapeProps {
    return {
      w: 220,
      h: 128,
      title: "",
      range: "24h",
      upIs: "neutral",
      ...EMPTY_POINT,
    }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: StatShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: StatShape, info: TLResizeInfo<StatShape>) {
    return resizeBox(shape, info, { minWidth: 140, minHeight: 80 })
  }

  component(shape: StatShape) {
    return (
      <HTMLContainer>
        <StatTile shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: StatShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }

  override toSvg(shape: StatShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <StatTile shape={shape} />
      </foreignObject>
    )
  }
}

const STATUS_LABEL: Partial<Record<LiveValue["statusKind"], string>> = {
  alarm: "Alarm",
  fault: "Fault",
  down: "Down",
  stale: "Stale",
  disabled: "Disabled",
  override: "Override",
}

/** A non-OK point status: icon and label, never color alone. */
export function StatusChip({ value }: { value: LiveValue | undefined }) {
  const label = value ? STATUS_LABEL[value.statusKind] : undefined
  if (!value || !label) return null
  const tone =
    value.statusKind === "alarm"
      ? "text-destructive"
      : value.statusKind === "override"
        ? "text-amber-700 dark:text-amber-400"
        : value.statusKind === "fault" || value.statusKind === "down"
          ? "text-orange-700 dark:text-orange-400"
          : "text-muted-foreground"
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 text-[11px]", tone)}
      title={value.status}
    >
      <Icon icon={Alert02Icon} className="size-3" />
      {label}
    </span>
  )
}

/**
 * One point as a headline number: its value, the change over the window and a
 * sparkline (on/off points show how long they were on instead).
 */
function StatTile({ shape }: { shape: StatShape }) {
  const { title, source, point, label, kind, units, range, upIs, w, h } =
    shape.props
  const ref = useMemo(() => (point ? { source, point } : null), [source, point])
  const refs = useMemo(() => (ref ? [ref] : []), [ref])
  const value = useLivePoint(ref)
  const span = rangeMs(range)
  const history = usePointHistories(
    refs,
    span,
    HISTORY_BUCKETS,
    refreshFor(span, HISTORY_BUCKETS)
  ).get(ref ? pointKey(ref) : "")
  const samples = useMemo(
    () => samplesFor(history?.buckets ?? null, history?.end ?? null, []),
    [history?.buckets, history?.end]
  )

  const exportReady = useDelaySvgExport()
  const ready = !history?.loading
  useEffect(() => {
    if (ready) exportReady()
  }, [ready, exportReady])

  const heading = title.trim() || label || "Stat tile"
  const rangeLabel = RANGES.find((r) => r.id === range)?.short ?? range
  const current = numericValue(value)
  const shown = value
    ? splitDisplay(value.display, value.units ?? units)
    : { main: "—", units: kind === "number" ? units : "" }
  // The number scales with the tile; units sit beside it, smaller.
  const size = Math.round(
    Math.min(Math.max(Math.min(h * 0.3, w * 0.2), 18), 72)
  )

  return (
    <div
      className="bas-chart flex size-full flex-col gap-1 overflow-hidden rounded-xl border bg-card px-3.5 py-3 text-card-foreground"
      style={{ pointerEvents: "all" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[11.5px] text-muted-foreground">
          {heading}
        </span>
        <span className="flex-1" />
        <StatusChip value={value} />
      </div>
      {point ? (
        <>
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              className="truncate leading-none font-semibold"
              style={{ fontSize: size }}
            >
              {shown.main}
            </span>
            {shown.units ? (
              <span
                className="shrink-0 text-muted-foreground"
                style={{ fontSize: Math.max(11, Math.round(size * 0.42)) }}
              >
                {shown.units}
              </span>
            ) : null}
          </div>
          {kind === "boolean" ? (
            <OnTime samples={samples} rangeLabel={rangeLabel} />
          ) : kind === "number" ? (
            <Change
              change={changeOver(samples, current)}
              units={value?.units ?? units}
              upIs={upIs}
              rangeLabel={rangeLabel}
            />
          ) : null}
          {kind !== "text" && h >= 110 ? (
            <Sparkline samples={samples} boolean={kind === "boolean"} />
          ) : null}
        </>
      ) : (
        <p className="pointer-events-none my-auto text-center text-[11px] text-muted-foreground">
          Drop a point here
        </p>
      )}
    </div>
  )
}

function Change({
  change,
  units,
  upIs,
  rangeLabel,
}: {
  change: number | null
  units: string
  upIs: UpIs
  rangeLabel: string
}) {
  if (change === null) return <span className="h-4" />
  const tone = changeTone(change, upIs)
  const rounded = Number(formatNumber(Math.abs(change)).replace(/,/g, ""))
  if (!rounded)
    return (
      <span className="text-[11px] text-muted-foreground">
        No change vs {rangeLabel} ago
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "flex items-center gap-0.5 font-medium",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          tone === "neutral" && "text-foreground"
        )}
      >
        <Icon
          icon={change > 0 ? ArrowUp02Icon : ArrowDown02Icon}
          className="size-3"
        />
        {formatNumber(Math.abs(change))}
        {units ? ` ${units}` : ""}
      </span>
      vs {rangeLabel} ago
    </span>
  )
}

function OnTime({
  samples,
  rangeLabel,
}: {
  samples: Sample[]
  rangeLabel: string
}) {
  const share = onShare(samples)
  if (share === null) return <span className="h-4" />
  return (
    <span className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">
        On {Math.round(share * 100)}%
      </span>{" "}
      of the last {rangeLabel}
    </span>
  )
}

/** The window in a quiet color, the most recent stretch in the accent. */
function Sparkline({
  samples,
  boolean,
}: {
  samples: Sample[]
  boolean: boolean
}) {
  const points = samples.filter((s) => s.v !== null) as {
    t: number
    v: number
  }[]
  if (points.length < 2) return <div className="min-h-4 flex-1" />
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100

  if (boolean) {
    return (
      <div className="relative mt-auto h-2 rounded-[2px] bg-muted">
        {runsOf(samples, t1).map((run) => (
          <div
            key={run.from}
            className="absolute inset-y-0 rounded-[2px]"
            style={{
              left: `${x(run.from)}%`,
              width: `${Math.max(0.5, x(run.to) - x(run.from))}%`,
              background: "var(--series-0)",
            }}
          />
        ))}
      </div>
    )
  }

  let lo = Math.min(...points.map((p) => p.v))
  let hi = Math.max(...points.map((p) => p.v))
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  const y = (v: number) => 28 - ((v - lo) / (hi - lo)) * 26
  const path = (list: typeof points) =>
    list
      .map(
        (p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`
      )
      .join(" ")
  // The last twelfth of the window is "now".
  const recent = points.slice(
    Math.max(0, Math.floor(points.length * (11 / 12)) - 1)
  )

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="mt-auto min-h-4 w-full flex-1"
      aria-hidden
    >
      <path
        d={path(points)}
        fill="none"
        className="stroke-muted-foreground/45"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <path
        d={path(recent)}
        fill="none"
        stroke="var(--series-0)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
