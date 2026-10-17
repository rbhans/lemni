"use client"

import { Table01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  createShapeId,
  type Editor,
  type TLShape,
  type TLShapeId,
  type VecLike,
} from "tldraw"

import type { LiveValue, PointRef } from "@/studio/data/live-points"
import type {
  PointDropContribution,
  PointMenuGroup,
} from "@/studio/plugins/types"

import {
  equipmentOf,
  groupByEquipmentKind,
  looksLikeEquipment,
  sameRow,
  toCsv,
} from "./model"
import { isTableShape, TABLE_TYPE, type TableShape } from "./table-shape"

const rowFor = (ref: PointRef) => ({
  source: ref.source,
  point: ref.point,
  label: ref.label ?? ref.point.split("/").pop() ?? ref.point,
})

/**
 * Adds points as rows (duplicates are skipped). A table that becomes several units
 * sharing point names switches to "By equipment".
 */
export function addRows(
  editor: Editor,
  table: TableShape,
  refs: readonly PointRef[]
) {
  const rows = [...table.props.rows]
  for (const ref of refs)
    if (!rows.some((row) => sameRow(row, ref))) rows.push(rowFor(ref))
  if (rows.length === table.props.rows.length) {
    toast.info(
      refs.length === 1
        ? "That point is already in this table."
        : "Those points are already in this table."
    )
    return false
  }
  const becameEquipment =
    !looksLikeEquipment(table.props.rows) &&
    looksLikeEquipment(rows) &&
    table.props.layout === "list" &&
    table.props.title === ""
  editor.markHistoryStoppingPoint("add table point")
  editor.updateShape({
    id: table.id,
    type: TABLE_TYPE,
    props: {
      rows,
      ...(becameEquipment ? { layout: "equipment" as const } : {}),
    },
  })
  return true
}

export function removeRow(
  editor: Editor,
  table: TableShape,
  ref: Pick<PointRef, "source" | "point">
) {
  editor.markHistoryStoppingPoint("remove table point")
  editor.updateShape({
    id: table.id,
    type: TABLE_TYPE,
    props: { rows: table.props.rows.filter((row) => !sameRow(row, ref)) },
  })
}

/**
 * Creates tables at `at`. Points from different kinds of equipment (an AHU and its
 * VAVs, say) get one table each, side by side: similar units become one "By
 * equipment" table, a single unit a list named after it.
 */
export function createTable(
  editor: Editor,
  at: VecLike,
  refs: readonly PointRef[] = []
) {
  const groups = refs.length ? groupByEquipmentKind(refs.map(rowFor)) : [[]]
  const ids: TLShapeId[] = []
  let x: number | null = null
  editor.markHistoryStoppingPoint("insert table")
  for (const rows of groups) {
    const units = [...new Set(rows.map((row) => equipmentOf(row.point)))]
    const layout = looksLikeEquipment(rows) ? "equipment" : "list"
    const names = new Set(rows.map((row) => row.label)).size
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), hi)
    const w = layout === "equipment" ? clamp(180 + 84 * names, 420, 1000) : 420
    // Tall enough for every row, up to a point.
    const lines = layout === "equipment" ? units.length : rows.length
    const h = clamp(32 + 28 + 28 * lines + 12, 240, 640)
    const oneUnit = layout === "list" && units.length === 1 && units[0] !== ""
    const id = createShapeId()
    editor.createShape({
      id,
      type: TABLE_TYPE,
      x: x ?? at.x - w / 2,
      y: at.y - 120,
      props: {
        w,
        h,
        rows,
        layout,
        ...(oneUnit
          ? {
              title: units[0],
              columns: { equipment: false, status: true, updated: false },
            }
          : {}),
      },
    })
    ids.push(id)
    x = (x ?? at.x - w / 2) + w + 40
  }
  editor.select(...ids)
}

/** The table as CSV with the values showing now. */
export function tableCsv(
  table: TableShape,
  values: Readonly<Record<string, LiveValue | undefined>>
) {
  const lines: (string | number | null)[][] = [
    ["Point", "Equipment", "Value", "Units", "Status", "Updated", "ORD"],
  ]
  for (const row of table.props.rows) {
    const value = values[`${row.source}\n${row.point}`]
    const raw = value?.value
    lines.push([
      row.label,
      equipmentOf(row.point),
      typeof raw === "number" || typeof raw === "string"
        ? raw
        : typeof raw === "boolean"
          ? (value?.display ?? String(raw))
          : null,
      value?.units ?? null,
      value?.status ?? null,
      value?.timestamp ? new Date(value.timestamp).toISOString() : null,
      row.point,
    ])
  }
  return toCsv(lines)
}

function tableAt(editor: Editor, hit: TLShape): TableShape | null {
  if (isTableShape(hit)) return hit
  const ancestor = editor.findShapeAncestor(hit, (s) => isTableShape(s))
  return isTableShape(ancestor) ? ancestor : null
}

/** The drop menu's Data flyout (shared by the data widgets). */
const DATA_GROUP: PointMenuGroup = { id: "data", label: "Data", order: 10 }

export const tablePointDrop: PointDropContribution = {
  id: "table",
  group: DATA_GROUP,
  order: 20,
  multiple: true,
  target: tableAt,
  drop({ editor }, shape, points) {
    if (!isTableShape(shape)) return
    if (addRows(editor, shape, points)) editor.select(shape.id)
  },
  create: {
    label: "Table",
    icon: Table01Icon,
    run: ({ editor }, points, at) => createTable(editor, at, points),
  },
}
