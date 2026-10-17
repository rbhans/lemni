"use client"

import {
  DashboardSquare01Icon,
  Menu01Icon,
  PercentIcon,
  PlusSignIcon,
  SlidersHorizontalIcon,
  Tag01Icon,
  TextIcon,
  ToggleOnIcon,
} from "@hugeicons/core-free-icons"
import {
  createShapeId,
  type Editor,
  type TLShapeId,
  type VecLike,
} from "tldraw"

import {
  getDataSource,
  kindOfValue,
  type PointDragData,
  type PointKind,
} from "@/studio/data/live-points"
import type {
  PointDropContribution,
  PointMenuGroup,
} from "@/studio/plugins/types"

import {
  designHeight,
  elementSize,
  newElement,
  normalizeElement,
  panelHeight,
  type UiElement,
  type UiKind,
} from "./model"
import {
  ELEMENT_TYPE,
  elementOf,
  isElementShape,
  isPanelShape,
  PANEL_TYPE,
  rowsOf,
  type UiElementShape,
  type UiPanelShape,
} from "./shapes"

/** The drop menu's UI flyout. */
const UI_GROUP: PointMenuGroup = { id: "ui", label: "UI", order: 30 }

/** The point fields of an element, from a dropped or chosen point. */
export function pointFields(point: {
  source: string
  point: string
  label?: string
}): Pick<UiElement, "source" | "point" | "pointLabel"> {
  return {
    source: point.source,
    point: point.point,
    pointLabel: point.label ?? point.point.split("/").pop() ?? point.point,
  }
}

function kindOf(point: PointDragData): PointKind | null {
  return (
    point.kind ??
    kindOfValue(getDataSource(point.source)?.value(point.point).get())
  )
}

/** A sensible control for a point: switch for on/off, setpoint for numbers, value otherwise. */
export function controlFor(point: PointDragData): UiKind {
  const kind = kindOf(point)
  return kind === "boolean"
    ? "switch"
    : kind === "number"
      ? "setpoint"
      : "value"
}

/** A readout row for a point in a panel: values for most, on/off as text. */
const rowFor = (point: PointDragData): UiElement =>
  newElement("value", pointFields(point))

export function createElement(
  editor: Editor,
  kind: UiKind,
  at: VecLike,
  init: Partial<UiElement> = {}
): TLShapeId {
  const el = newElement(kind, init)
  const { w, h } = elementSize(kind, el)
  const id = createShapeId()
  editor.markHistoryStoppingPoint(`insert ${kind}`)
  editor.createShape({
    id,
    type: ELEMENT_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h, el: { ...el } },
  })
  editor.select(id)
  return id
}

export function createPanel(
  editor: Editor,
  at: VecLike,
  rows: UiElement[] = [],
  title = "Panel"
): TLShapeId {
  const w = 300
  const h = panelHeight(rows.length, Boolean(title))
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert panel")
  editor.createShape({
    id,
    type: PANEL_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h, title, rows: rows.map((row) => ({ ...row })) },
  })
  editor.select(id)
  return id
}

export function updateElement(
  editor: Editor,
  shape: UiElementShape,
  patch: Partial<UiElement>
) {
  const before = elementOf(shape)
  const after = normalizeElement({ ...before, ...patch })
  // Content is scaled from the design height, so keep the scale when a change moves it:
  // a new kind takes its own size, a stacked nav bar grows with its links.
  const scale = shape.props.h / designHeight(before)
  const size: { w?: number; h?: number } = {}
  if (after.kind !== before.kind) {
    const fresh = elementSize(after.kind, after)
    size.w = Math.round(fresh.w * scale)
    size.h = Math.round(fresh.h * scale)
  } else if (designHeight(after) !== designHeight(before)) {
    size.h = Math.round(designHeight(after) * scale)
  } else if (
    after.kind === "nav" &&
    after.links.length !== before.links.length
  ) {
    size.w = Math.max(
      shape.props.w,
      Math.round(elementSize("nav", after).w * scale)
    )
  }
  editor.markHistoryStoppingPoint("change UI element")
  editor.updateShape({
    id: shape.id,
    type: ELEMENT_TYPE,
    props: { ...size, el: { ...after } },
  })
}

/** Replaces a panel's rows; the panel grows or shrinks to fit them. */
export function setPanelRows(
  editor: Editor,
  shape: UiPanelShape,
  rows: UiElement[]
) {
  editor.markHistoryStoppingPoint("change panel rows")
  editor.updateShape({
    id: shape.id,
    type: PANEL_TYPE,
    props: {
      rows: rows.map((row) => ({ ...row })),
      h: panelHeight(rows.length, Boolean(shape.props.title)),
    },
  })
}

export function setPanelTitle(
  editor: Editor,
  shape: UiPanelShape,
  title: string
) {
  editor.markHistoryStoppingPoint("rename panel")
  editor.updateShape({
    id: shape.id,
    type: PANEL_TYPE,
    props: {
      title,
      h: panelHeight(rowsOf(shape).length, Boolean(title)),
    },
  })
}

/** Dropping a point on an element binds it. */
export const elementPointDrop: PointDropContribution = {
  id: "ui-element",
  order: 30,
  target: (_editor, hit) => (isElementShape(hit) ? hit : null),
  drop: ({ editor }, shape, [point]) => {
    if (!point || !isElementShape(shape)) return
    updateElement(editor, shape, pointFields(point))
  },
  group: UI_GROUP,
  creates: (
    [
      ["switch", "Switch", ToggleOnIcon, ["boolean"]],
      ["setpoint", "Setpoint", PlusSignIcon, ["number"]],
      ["slider", "Slider", SlidersHorizontalIcon, ["number"]],
      ["select", "Select", Menu01Icon, ["text"]],
      ["badge", "Badge", Tag01Icon, ["boolean", "text"]],
      ["progress", "Progress", PercentIcon, ["number"]],
      ["value", "Value", TextIcon, ["boolean", "number", "text"]],
    ] as const
  ).map(([kind, label, icon, kinds]) => ({
    id: kind,
    label,
    icon,
    accepts: ([point]: PointDragData[]) => {
      const k = point ? kindOf(point) : null
      return k === null || (kinds as readonly string[]).includes(k)
    },
    suggested: ([point]: PointDragData[]) =>
      Boolean(point) && controlFor(point) === kind,
    run: ({ editor }, [point], at) => {
      if (point) createElement(editor, kind, at, pointFields(point))
    },
  })),
}

/** A panel's title from its points: the equipment they share (AHU_1 for AHU_1/points/…). */
function panelTitle(points: PointDragData[]): string {
  const folders = points.map((p) => {
    const parts = p.point
      .replace(/^slot:\//, "")
      .split("/")
      .slice(0, -1)
    if (parts.at(-1)?.toLowerCase() === "points") parts.pop()
    return parts.at(-1) ?? ""
  })
  const first = folders[0]
  return first && folders.every((f) => f === first)
    ? first.replace(/_/g, "-")
    : "Panel"
}

/** Dropping points (or a whole equipment folder) on a panel adds rows. */
export const panelPointDrop: PointDropContribution = {
  id: "ui-panel",
  order: 31,
  multiple: true,
  target: (_editor, hit) => (isPanelShape(hit) ? hit : null),
  drop: ({ editor }, shape, points) => {
    if (!isPanelShape(shape)) return
    const rows = rowsOf(shape)
    const have = new Set(rows.map((r) => `${r.source}\n${r.point}`))
    const added = points
      .filter((p) => !have.has(`${p.source}\n${p.point}`))
      .map(rowFor)
    if (added.length)
      setPanelRows(editor, shape, [...rows, ...added].slice(0, 40))
  },
  group: UI_GROUP,
  creates: [
    {
      id: "panel",
      label: "Panel",
      icon: DashboardSquare01Icon,
      multiple: true,
      suggested: (points) => points.length > 1,
      run: ({ editor }, points, at) =>
        createPanel(
          editor,
          at,
          points.slice(0, 40).map(rowFor),
          panelTitle(points)
        ),
    },
  ],
}
