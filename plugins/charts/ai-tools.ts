"use client"

import type { Editor, TLShapeId, VecLike } from "tldraw"

import { safeBatch } from "@/studio/ai/batch"
import { pageForInsert, pageIdSchema } from "@/studio/ai/pages"
import { pointIdSchema, resolvePoints, sourceSchema } from "@/studio/ai/points"
import type { JsonSchema } from "@/studio/ai/schema"
import type { PointDragData } from "@/studio/data/live-points"
import type { AiBoardTool, AiContribution } from "@/studio/plugins/types"

import { addSeries, createChart, seriesFor } from "./chart-points"
import { CHART_TYPE, isChartShape, type ChartShape } from "./chart-shape"
import { GAUGE_TYPE, isGaugeShape } from "./gauge-shape"
import { MAX_SERIES, RANGES, type ChartRange, type ChartSeries } from "./model"
import { isStatShape, STAT_TYPE } from "./stat-shape"
import { createGauge, createStat } from "./value-points"

// Live data widgets for AI apps: trend charts, stat tiles and gauges, made from station
// points (ords from the Niagara plugin's find_points).

const RANGE_IDS = RANGES.map((r) => r.id)
const at = {
  x: { type: "number" },
  y: { type: "number" },
  pageId: pageIdSchema,
} as const

function centerOf(editor: Editor, input: { x?: number; y?: number }): VecLike {
  const center = editor.getViewportPageBounds().center
  return { x: input.x ?? center.x, y: input.y ?? center.y }
}

/** Sorts points into those a chart can take and those it can't, with why. */
function chartable(points: PointDragData[], existing: readonly ChartSeries[]) {
  const ok: PointDragData[] = []
  const skipped: { point: string; why: string }[] = []
  const series = [...existing]
  for (const point of points) {
    if (point.kind === null) {
      skipped.push({
        point: point.point,
        why: "the station didn't return a value for it",
      })
      continue
    }
    const next = seriesFor(point, point.kind, series)
    if (typeof next === "string")
      skipped.push({ point: point.point, why: next })
    else {
      series.push(next)
      ok.push(point)
    }
  }
  return { ok, skipped }
}

const createTrendChart: AiBoardTool<{
  points: string[]
  source?: string
  title?: string
  range?: ChartRange
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "create_trend_chart",
  title: "Add a trend chart",
  access: "edit",
  timeoutMs: 30_000,
  description: `Adds a live trend chart of up to ${MAX_SERIES} numeric or on/off points (ords from find_points), centered at x/y (default: the middle of the view) on the person's page. Points with different units get their own panes; on/off points get lanes. range: ${RANGE_IDS.join(", ")} (default 24h).`,
  inputSchema: {
    type: "object",
    required: ["points"],
    additionalProperties: false,
    properties: {
      points: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SERIES,
        items: pointIdSchema,
      },
      source: sourceSchema,
      title: { type: "string", maxLength: 120 },
      range: { type: "string", enum: RANGE_IDS },
      ...at,
    },
  },
  async run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "Trend charts")
    const { ok, skipped } = chartable(
      await resolvePoints(input.points, input.source),
      []
    )
    if (!ok.length)
      throw new Error(
        `None of those points can be charted: ${skipped.map((s) => `${s.point} (${s.why})`).join("; ")}`
      )
    const id = safeBatch(editor, () => {
      createChart(editor, centerOf(editor, input), ok)
      const id = editor.getOnlySelectedShapeId()
      if (id && (input.title || input.range))
        editor.updateShape({
          id,
          type: CHART_TYPE,
          props: {
            ...(input.title ? { title: input.title } : {}),
            ...(input.range ? { range: input.range } : {}),
          },
        })
      return id
    })
    return {
      text: `Added a trend chart with ${ok.length} point(s).`,
      data: { id, ...(skipped.length ? { skipped } : {}) },
    }
  },
}

const addChartPoints: AiBoardTool<{
  chartId: string
  points: string[]
  source?: string
}> = {
  name: "add_chart_points",
  title: "Add points to a chart",
  access: "edit",
  timeoutMs: 30_000,
  description: `Adds points to an existing trend chart (up to ${MAX_SERIES} in all).`,
  inputSchema: {
    type: "object",
    required: ["chartId", "points"],
    additionalProperties: false,
    properties: {
      chartId: { type: "string" },
      points: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SERIES,
        items: pointIdSchema,
      },
      source: sourceSchema,
    },
  },
  async run({ editor }, input) {
    const chart = editor.getShape(input.chartId as TLShapeId)
    if (!isChartShape(chart))
      throw new Error(`${input.chartId} isn't a trend chart.`)
    const { ok, skipped } = chartable(
      await resolvePoints(input.points, input.source),
      chart.props.series
    )
    if (!ok.length)
      throw new Error(
        `Nothing added: ${skipped.map((s) => `${s.point} (${s.why})`).join("; ")}`
      )
    safeBatch(editor, () =>
      addSeries(editor, editor.getShape(chart.id) as ChartShape, ok)
    )
    return {
      text: `Added ${ok.length} point(s).`,
      data: skipped.length ? { skipped } : undefined,
    }
  },
}

const valueSchema = (
  extra: Record<string, JsonSchema>
): JsonSchema & { type: "object" } => ({
  type: "object",
  required: ["point"],
  additionalProperties: false,
  properties: {
    point: pointIdSchema,
    source: sourceSchema,
    title: { type: "string", maxLength: 120 },
    ...extra,
    ...at,
  },
})

const createStatTile: AiBoardTool<{
  point: string
  source?: string
  title?: string
  range?: ChartRange
  upIs?: "neutral" | "good" | "bad"
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "create_stat_tile",
  title: "Add a stat tile",
  access: "edit",
  timeoutMs: 30_000,
  description:
    "Adds a stat tile: one point's live value, its change over a range, and a sparkline. upIs says whether rising is good, bad or neutral (colors the change).",
  inputSchema: valueSchema({
    range: { type: "string", enum: RANGE_IDS },
    upIs: { type: "string", enum: ["neutral", "good", "bad"] },
  }),
  async run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "Stat tiles")
    const [point] = await resolvePoints([input.point], input.source)
    const id = safeBatch(editor, () => {
      createStat(editor, centerOf(editor, input), point)
      const id = editor.getOnlySelectedShapeId()
      if (id)
        editor.updateShape({
          id,
          type: STAT_TYPE,
          props: {
            ...(input.title ? { title: input.title } : {}),
            ...(input.range ? { range: input.range } : {}),
            ...(input.upIs ? { upIs: input.upIs } : {}),
          },
        })
      return id
    })
    return { text: `Added a stat tile for ${point.label}.`, data: { id } }
  },
}

const createGaugeTool: AiBoardTool<{
  point: string
  source?: string
  title?: string
  style?: "dial" | "bar"
  min?: number
  max?: number
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "create_gauge",
  title: "Add a gauge",
  access: "edit",
  timeoutMs: 30_000,
  description:
    "Adds a dial or bar gauge for one numeric point. min/max default to a range that fits the units and current value.",
  inputSchema: valueSchema({
    style: { type: "string", enum: ["dial", "bar"] },
    min: { type: "number" },
    max: { type: "number" },
  }),
  async run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "Gauges")
    const [point] = await resolvePoints([input.point], input.source)
    if (point.kind !== "number")
      throw new Error(
        point.kind === null
          ? "The station didn't return a value for that point."
          : "Gauges show numeric points. Use create_stat_tile for this one."
      )
    if (
      input.min !== undefined &&
      input.max !== undefined &&
      input.min >= input.max
    )
      throw new Error("min must be below max.")
    const id = safeBatch(editor, () => {
      createGauge(editor, centerOf(editor, input), input.style ?? "dial", point)
      const id = editor.getOnlySelectedShapeId()
      if (id)
        editor.updateShape({
          id,
          type: GAUGE_TYPE,
          props: {
            ...(input.title ? { title: input.title } : {}),
            ...(input.min !== undefined ? { min: input.min } : {}),
            ...(input.max !== undefined ? { max: input.max } : {}),
          },
        })
      return id
    })
    return { text: `Added a gauge for ${point.label}.`, data: { id } }
  },
}

export const chartsAi: AiContribution = {
  guide:
    "Live widgets for UI pages: create_trend_chart (history and live tail, panes per unit), create_stat_tile (value, change, sparkline) and create_gauge (numeric, dial or bar). Find point ords with find_points first.",
  tools: [
    createTrendChart,
    addChartPoints,
    createStatTile,
    createGaugeTool,
  ] as AiContribution["tools"],
  shapes: {
    [CHART_TYPE]: (_editor, shape) =>
      isChartShape(shape)
        ? {
            widget: "trend chart",
            title: shape.props.title || undefined,
            range: shape.props.range,
            series: shape.props.series.map((s) => ({
              label: s.label,
              point: s.point,
              units: s.units || undefined,
              kind: s.kind,
            })),
          }
        : null,
    [STAT_TYPE]: (_editor, shape) =>
      isStatShape(shape)
        ? {
            widget: "stat tile",
            title: shape.props.title || undefined,
            point: shape.props.point || undefined,
            units: shape.props.units || undefined,
            range: shape.props.range,
          }
        : null,
    [GAUGE_TYPE]: (_editor, shape) =>
      isGaugeShape(shape)
        ? {
            widget: "gauge",
            title: shape.props.title || undefined,
            point: shape.props.point || undefined,
            units: shape.props.units || undefined,
            style: shape.props.style,
            min: shape.props.min,
            max: shape.props.max,
          }
        : null,
  },
}
