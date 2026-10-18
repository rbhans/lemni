"use client"

import { ChartLineData01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { createShapeId, type Editor, type TLShape, type VecLike } from "tldraw"

import {
  getDataSource,
  kindOfValue,
  type PointDragData,
  type PointDropContribution,
  type PointKind,
  type PointMenuGroup,
  type PointRef,
} from "@/sdk"

import { CHART_TYPE, isChartShape, type ChartShape } from "./chart-shape"
import { MAX_SERIES, nextSlot, sameSeries, type ChartSeries } from "./model"

/** A new series for a point, or why it can't join the chart. */
export function seriesFor(
  ref: PointRef,
  kind: PointKind | null,
  existing: readonly ChartSeries[]
): ChartSeries | string {
  if (existing.some((s) => sameSeries(s, ref)))
    return "That point is already on this chart."
  const value = getDataSource(ref.source)?.value(ref.point).get()
  const resolved = kind ?? kindOfValue(value)
  if (resolved !== "number" && resolved !== "boolean")
    return "Charts plot numeric and on/off points."
  const slot = nextSlot(existing)
  if (slot === null)
    return `A chart holds up to ${MAX_SERIES} points. Add another chart for more.`
  return {
    source: ref.source,
    point: ref.point,
    label: ref.label ?? ref.point.split("/").pop() ?? ref.point,
    kind: resolved,
    units: resolved === "number" ? (value?.units ?? "") : "",
    slot,
  }
}

/**
 * Adds points to a chart. Points that can't join (text points, duplicates, a full
 * chart) are skipped; the person hears why when nothing was added or some were left out.
 */
export function addSeries(
  editor: Editor,
  chart: ChartShape,
  refs: readonly (PointRef & { kind: PointKind | null })[]
) {
  const series = [...chart.props.series]
  const reasons: string[] = []
  for (const ref of refs) {
    const next = seriesFor(ref, ref.kind, series)
    if (typeof next === "string") reasons.push(next)
    else series.push(next)
  }
  const added = series.length - chart.props.series.length
  if (!added) {
    toast.info(reasons[0] ?? "Nothing to add.")
    return false
  }
  if (reasons.length)
    toast.info(`Added ${added} of ${refs.length} points`, {
      description:
        series.length >= MAX_SERIES
          ? `A chart holds up to ${MAX_SERIES}; text points and duplicates are left out.`
          : "Text points and duplicates are left out.",
    })
  editor.markHistoryStoppingPoint("add chart point")
  editor.updateShape({ id: chart.id, type: CHART_TYPE, props: { series } })
  return true
}

export function removeSeries(
  editor: Editor,
  chart: ChartShape,
  ref: Pick<ChartSeries, "source" | "point">
) {
  editor.markHistoryStoppingPoint("remove chart point")
  editor.updateShape({
    id: chart.id,
    type: CHART_TYPE,
    props: { series: chart.props.series.filter((s) => !sameSeries(s, ref)) },
  })
}

/** Creates a trend chart centered on `at`, optionally starting with points. */
export function createChart(
  editor: Editor,
  at: VecLike,
  points: readonly PointDragData[] = []
) {
  const series: ChartSeries[] = []
  let firstProblem: string | null = null
  for (const point of points) {
    const next = seriesFor(point, point.kind, series)
    if (typeof next === "string") firstProblem ??= next
    else series.push(next)
  }
  if (points.length && !series.length) {
    toast.info(firstProblem ?? "Nothing to chart.")
    return
  }
  if (series.length < points.length)
    toast.info(`Charted ${series.length} of ${points.length} points`, {
      description: `A chart holds up to ${MAX_SERIES}; text points are left out.`,
    })
  // Room for a few panes and every on/off lane when starting from many points.
  const lanes = series.filter((s) => s.kind === "boolean").length
  const numbers = series.length - lanes
  const w = series.length > 3 ? 560 : 480
  const h = Math.min(280 + lanes * 24 + (numbers > 2 ? 120 : 0), 640)
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert chart")
  editor.createShape({
    id,
    type: CHART_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h, series },
  })
  editor.select(id)
}

/** The chart a drop lands on: the shape hit, or a chart it sits in. */
function chartAt(editor: Editor, hit: TLShape): ChartShape | null {
  if (isChartShape(hit)) return hit
  const ancestor = editor.findShapeAncestor(hit, (s) => isChartShape(s))
  return isChartShape(ancestor) ? ancestor : null
}

/** The drop menu's Data flyout (shared by the data widgets). */
const DATA_GROUP: PointMenuGroup = { id: "data", label: "Data", order: 10 }

export const chartPointDrop: PointDropContribution = {
  id: "chart",
  group: DATA_GROUP,
  order: 10,
  multiple: true,
  target: chartAt,
  drop({ editor }, shape, points) {
    if (!isChartShape(shape)) return
    if (addSeries(editor, shape, points)) editor.select(shape.id)
  },
  create: {
    label: "Trend chart",
    icon: ChartLineData01Icon,
    run: ({ editor }, points, at) => createChart(editor, at, points),
  },
}
