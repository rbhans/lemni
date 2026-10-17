"use client"

import {
  Analytics01Icon,
  DashboardSpeed01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { createShapeId, type Editor, type TLShape, type VecLike } from "tldraw"

import {
  getDataSource,
  kindOfValue,
  numericValue,
  type PointDragData,
  type PointKind,
  type PointRef,
} from "@/studio/data/live-points"
import type {
  PointDropContribution,
  PointMenuGroup,
} from "@/studio/plugins/types"

import {
  GAUGE_SIZE,
  GAUGE_TYPE,
  isGaugeShape,
  type GaugeShape,
  type GaugeStyle,
} from "./gauge-shape"
import { isStatShape, STAT_TYPE, type StatShape } from "./stat-shape"
import { defaultGaugeRange } from "./value-model"
import type { ValuePointProps } from "./value-props"

/** What a single-value widget stores about its point. */
function pointProps(ref: PointRef, kind: PointKind | null): ValuePointProps {
  const value = getDataSource(ref.source)?.value(ref.point).get()
  return {
    source: ref.source,
    point: ref.point,
    label: ref.label ?? ref.point.split("/").pop() ?? ref.point,
    kind: kind ?? kindOfValue(value) ?? "text",
    units: value?.units ?? "",
  }
}

const currentNumber = (ref: PointRef) =>
  numericValue(getDataSource(ref.source)?.value(ref.point).get())

export function createStat(editor: Editor, at: VecLike, point?: PointDragData) {
  const w = 220
  const h = 128
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert stat tile")
  editor.createShape({
    id,
    type: STAT_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h, ...(point ? pointProps(point, point.kind) : {}) },
  })
  editor.select(id)
}

export function setStatPoint(
  editor: Editor,
  shape: StatShape,
  ref: PointRef,
  kind: PointKind | null
) {
  editor.markHistoryStoppingPoint("change stat point")
  editor.updateShape({
    id: shape.id,
    type: STAT_TYPE,
    props: pointProps(ref, kind),
  })
}

/** Gauges show numbers; this says so for anything else. */
function gaugeProps(ref: PointRef, kind: PointKind | null) {
  const props = pointProps(ref, kind)
  if (props.kind !== "number") {
    toast.info("Gauges show numeric points. Try a stat tile for this one.")
    return null
  }
  return props
}

export function createGauge(
  editor: Editor,
  at: VecLike,
  style: GaugeStyle,
  point?: PointDragData
) {
  const props = point ? gaugeProps(point, point.kind) : null
  if (point && !props) return
  const [min, max] = defaultGaugeRange(
    props?.units ?? "",
    point ? currentNumber(point) : null
  )
  const { w, h } = GAUGE_SIZE[style]
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert gauge")
  editor.createShape({
    id,
    type: GAUGE_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h, style, min, max, ...(props ?? {}) },
  })
  editor.select(id)
}

export function setGaugePoint(
  editor: Editor,
  shape: GaugeShape,
  ref: PointRef,
  kind: PointKind | null
) {
  const props = gaugeProps(ref, kind)
  if (!props) return
  // A gauge getting its first point also gets a scale that fits it.
  const scale = shape.props.point
    ? {}
    : (([min, max]) => ({ min, max }))(
        defaultGaugeRange(props.units, currentNumber(ref))
      )
  editor.markHistoryStoppingPoint("change gauge point")
  editor.updateShape({
    id: shape.id,
    type: GAUGE_TYPE,
    props: { ...props, ...scale },
  })
}

function ownerOf<S extends TLShape>(
  editor: Editor,
  hit: TLShape,
  is: (shape: TLShape) => shape is S
): S | null {
  if (is(hit)) return hit
  const ancestor = editor.findShapeAncestor(hit, (s) => is(s))
  return ancestor && is(ancestor) ? ancestor : null
}

/** The drop menu's Data flyout (shared by the data widgets). */
const DATA_GROUP: PointMenuGroup = { id: "data", label: "Data", order: 10 }

export const statPointDrop: PointDropContribution = {
  id: "stat",
  group: DATA_GROUP,
  order: 12,
  target: (editor, hit) => ownerOf(editor, hit, isStatShape),
  drop({ editor }, shape, [point]) {
    if (!isStatShape(shape)) return
    setStatPoint(editor, shape, point, point.kind)
    editor.select(shape.id)
  },
  create: {
    label: "Stat tile",
    icon: Analytics01Icon,
    run: ({ editor }, [point], at) => createStat(editor, at, point),
  },
}

export const gaugePointDrop: PointDropContribution = {
  id: "gauge",
  group: DATA_GROUP,
  order: 14,
  target: (editor, hit) => ownerOf(editor, hit, isGaugeShape),
  drop({ editor }, shape, [point]) {
    if (!isGaugeShape(shape)) return
    setGaugePoint(editor, shape, point, point.kind)
    editor.select(shape.id)
  },
  create: {
    label: "Gauge",
    icon: DashboardSpeed01Icon,
    run: ({ editor }, [point], at) => createGauge(editor, at, "dial", point),
  },
}
