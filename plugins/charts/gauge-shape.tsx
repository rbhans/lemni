"use client"

import "./charts.css"

import { useEffect, useMemo } from "react"
import { Alert02Icon } from "@hugeicons/core-free-icons"
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

import { Icon, numericValue, registerShapeLabel, useLivePoint } from "@/sdk"

import { formatNumber } from "./model"
import { StatusChip } from "./stat-shape"
import {
  EMPTY_POINT,
  valuePointValidators,
  type ValuePointProps,
} from "./value-props"
import {
  arcPath,
  dialAngle,
  fractionOf,
  polar,
  severityOf,
  splitDisplay,
  type Limits,
  type Severity,
} from "./value-model"

export const GAUGE_TYPE = "bas-gauge"

export type GaugeStyle = "dial" | "bar"

export interface GaugeShapeProps extends ValuePointProps, Limits {
  w: number
  h: number
  /** Empty: the point's name. */
  title: string
  style: GaugeStyle
  min: number
  max: number
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [GAUGE_TYPE]: GaugeShapeProps
  }
}

export type GaugeShape = TLShape<typeof GAUGE_TYPE>

export const isGaugeShape = (
  shape: TLShape | undefined | null
): shape is GaugeShape => shape?.type === GAUGE_TYPE

registerShapeLabel(GAUGE_TYPE, (shape) =>
  isGaugeShape(shape) && shape.props.style === "bar" ? "Bar gauge" : "Gauge"
)

export const GAUGE_SIZE: Record<GaugeStyle, { w: number; h: number }> = {
  dial: { w: 200, h: 176 },
  bar: { w: 260, h: 92 },
}

export class GaugeShapeUtil extends ShapeUtil<GaugeShape> {
  static override type = GAUGE_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    style: T.literalEnum("dial", "bar"),
    min: T.number,
    max: T.number,
    alarmLow: T.number.nullable(),
    warnLow: T.number.nullable(),
    warnHigh: T.number.nullable(),
    alarmHigh: T.number.nullable(),
    ...valuePointValidators,
  }

  getDefaultProps(): GaugeShapeProps {
    return {
      ...GAUGE_SIZE.dial,
      title: "",
      style: "dial",
      min: 0,
      max: 100,
      alarmLow: null,
      warnLow: null,
      warnHigh: null,
      alarmHigh: null,
      ...EMPTY_POINT,
    }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: GaugeShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: GaugeShape, info: TLResizeInfo<GaugeShape>) {
    return resizeBox(shape, info, {
      minWidth: 140,
      minHeight: shape.props.style === "bar" ? 72 : 120,
    })
  }

  component(shape: GaugeShape) {
    return (
      <HTMLContainer>
        <Gauge shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: GaugeShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }

  override toSvg(shape: GaugeShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <Gauge shape={shape} />
      </foreignObject>
    )
  }
}

const FILL: Record<Severity["level"], string> = {
  normal: "var(--series-0)",
  warning: "var(--status-warning)",
  alarm: "var(--status-critical)",
}

const limitsOf = (props: GaugeShapeProps): Limits => ({
  alarmLow: props.alarmLow,
  warnLow: props.warnLow,
  warnHigh: props.warnHigh,
  alarmHigh: props.alarmHigh,
})

/** One numeric point against its scale; the fill turns amber or red past its limits. */
function Gauge({ shape }: { shape: GaugeShape }) {
  const props = shape.props
  const ref = useMemo(
    () => (props.point ? { source: props.source, point: props.point } : null),
    [props.source, props.point]
  )
  const value = useLivePoint(ref)

  // Live values are already in the store; nothing to wait for.
  const exportReady = useDelaySvgExport()
  useEffect(() => {
    exportReady()
  }, [exportReady])

  const current = numericValue(value)
  const severity = severityOf(current, limitsOf(props))
  const heading = props.title.trim() || props.label || "Gauge"
  const shown = value
    ? splitDisplay(value.display, value.units ?? props.units)
    : { main: "—", units: props.units }

  return (
    <div
      className="bas-chart flex size-full flex-col overflow-hidden rounded-xl border bg-card px-3.5 py-3 text-card-foreground"
      style={{ pointerEvents: "all" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[11.5px] text-muted-foreground">
          {heading}
        </span>
        <span className="flex-1" />
        {value && value.statusKind !== "ok" ? (
          <StatusChip value={value} />
        ) : (
          <LimitChip severity={severity} units={shown.units} />
        )}
      </div>
      {!props.point ? (
        <p className="pointer-events-none my-auto text-center text-[11px] text-muted-foreground">
          Drop a numeric point here
        </p>
      ) : props.style === "dial" ? (
        <Dial
          props={props}
          current={current}
          severity={severity}
          shown={shown}
        />
      ) : (
        <Bar
          props={props}
          current={current}
          severity={severity}
          shown={shown}
        />
      )}
    </div>
  )
}

function LimitChip({ severity, units }: { severity: Severity; units: string }) {
  if (severity.level === "normal") return null
  const text = `${severity.side === "high" ? "High" : "Low"} ${severity.level}`
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[11px]"
      title={`${severity.side === "high" ? "At or above" : "At or below"} ${formatNumber(severity.limit)}${units ? ` ${units}` : ""}`}
    >
      {/* The icon carries the status color; the words stay in the text color. */}
      <span style={{ color: FILL[severity.level] }}>
        <Icon icon={Alert02Icon} className="size-3" strokeWidth={2} />
      </span>
      {text}
    </span>
  )
}

function limitMarks(props: GaugeShapeProps) {
  return [props.alarmLow, props.warnLow, props.warnHigh, props.alarmHigh]
    .filter((v): v is number => v !== null && v > props.min && v < props.max)
    .map((v) => fractionOf(v, props.min, props.max))
}

function Dial({
  props,
  current,
  severity,
  shown,
}: {
  props: GaugeShapeProps
  current: number | null
  severity: Severity
  shown: { main: string; units: string }
}) {
  const cx = 100
  const cy = 86
  const r = 66
  const stroke = 13
  const start = dialAngle(0)
  const end = dialAngle(1)
  const at =
    current === null
      ? null
      : dialAngle(fractionOf(current, props.min, props.max))
  const ends = [polar(cx, cy, r, start), polar(cx, cy, r, end)]

  return (
    <svg
      viewBox="0 0 200 150"
      className="min-h-0 w-full flex-1"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${shown.main} ${shown.units} on a scale of ${props.min} to ${props.max}`}
    >
      <path
        d={arcPath(cx, cy, r, start, end)}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {at !== null ? (
        <path
          d={arcPath(cx, cy, r, start, at)}
          fill="none"
          stroke={FILL[severity.level]}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ) : null}
      {limitMarks(props).map((f) => {
        const a = polar(cx, cy, r + stroke / 2 + 2, dialAngle(f))
        const b = polar(cx, cy, r + stroke / 2 + 8, dialAngle(f))
        return (
          <line
            key={f}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className="stroke-muted-foreground"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )
      })}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-foreground font-semibold"
        fontSize={30}
      >
        {shown.main}
      </text>
      {shown.units ? (
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={12}
        >
          {shown.units}
        </text>
      ) : null}
      {[props.min, props.max].map((v, i) => (
        <text
          key={i}
          x={ends[i].x}
          y={ends[i].y + 22}
          textAnchor="middle"
          className="fill-muted-foreground tabular-nums"
          fontSize={10.5}
        >
          {formatNumber(v)}
        </text>
      ))}
    </svg>
  )
}

function Bar({
  props,
  current,
  severity,
  shown,
}: {
  props: GaugeShapeProps
  current: number | null
  severity: Severity
  shown: { main: string; units: string }
}) {
  const fraction =
    current === null ? 0 : fractionOf(current, props.min, props.max)
  return (
    <div className="mt-auto flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl leading-none font-semibold">
          {shown.main}
        </span>
        {shown.units ? (
          <span className="text-xs text-muted-foreground">{shown.units}</span>
        ) : null}
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        {current !== null ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${fraction * 100}%`,
              minWidth: 8,
              background: FILL[severity.level],
            }}
          />
        ) : null}
        {limitMarks(props).map((f) => (
          <div
            key={f}
            className="absolute -top-1 h-4 w-px bg-muted-foreground"
            style={{ left: `${f * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
        <span>{formatNumber(props.min)}</span>
        <span>{formatNumber(props.max)}</span>
      </div>
    </div>
  )
}
