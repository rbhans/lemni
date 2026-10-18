"use client"

import type { TLShapeId } from "tldraw"

import {
  pageForInsert,
  pageIdSchema,
  pickSource,
  pointIdSchema,
  pointLabel,
  sourceSchema,
  type AiBoardTool,
  type AiContribution,
  type PointRef,
} from "@/sdk"

import { addRows, createTable } from "./table-points"
import { isTableShape, TABLE_TYPE, type TableShape } from "./table-shape"

// Live tables for AI apps. Points from several pieces of equipment of one kind become
// a "by equipment" table (one row per unit, one column per point name).

const refsFor = (points: readonly string[], sourceId?: string): PointRef[] => {
  const source = pickSource(sourceId)
  return points.map((point) => ({
    source: source.id,
    point,
    label: pointLabel(point),
  }))
}

const createLiveTable: AiBoardTool<{
  points: string[]
  source?: string
  title?: string
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "create_live_table",
  title: "Add a live table",
  access: "edit",
  description:
    "Adds live tables of points (ords from find_points), centered near x/y (default: the middle of the view). Points from similar equipment (VAV-2-01…05) become one table with a row per unit; different kinds of equipment get a table each. Returns the table ids.",
  inputSchema: {
    type: "object",
    required: ["points"],
    additionalProperties: false,
    properties: {
      points: {
        type: "array",
        minItems: 1,
        maxItems: 300,
        items: pointIdSchema,
      },
      source: sourceSchema,
      title: { type: "string", maxLength: 120 },
      x: { type: "number" },
      y: { type: "number" },
      pageId: pageIdSchema,
    },
  },
  run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "Live tables")
    const center = editor.getViewportPageBounds().center
    createTable(
      editor,
      { x: input.x ?? center.x, y: input.y ?? center.y },
      refsFor(input.points, input.source)
    )
    const ids = editor.getSelectedShapeIds()
    if (input.title && ids.length === 1)
      editor.updateShape({
        id: ids[0],
        type: TABLE_TYPE,
        props: { title: input.title },
      })
    return { text: `Added ${ids.length} table(s).`, data: { ids } }
  },
}

const addTableRows: AiBoardTool<{
  tableId: string
  points: string[]
  source?: string
}> = {
  name: "add_table_rows",
  title: "Add points to a table",
  access: "edit",
  description:
    "Adds points to an existing live table (points already in it are skipped).",
  inputSchema: {
    type: "object",
    required: ["tableId", "points"],
    additionalProperties: false,
    properties: {
      tableId: { type: "string" },
      points: {
        type: "array",
        minItems: 1,
        maxItems: 300,
        items: pointIdSchema,
      },
      source: sourceSchema,
    },
  },
  run({ editor }, input) {
    const table = editor.getShape(input.tableId as TLShapeId)
    if (!isTableShape(table))
      throw new Error(`${input.tableId} isn't a live table.`)
    const before = table.props.rows.length
    addRows(editor, table, refsFor(input.points, input.source))
    const after = (editor.getShape(table.id) as TableShape).props.rows.length
    return { text: `Added ${after - before} row(s).` }
  },
}

export const tablesAi: AiContribution = {
  guide:
    "create_live_table shows many points at once (status, value, age); good for VAV boxes or a device's points. add_table_rows extends one.",
  tools: [createLiveTable, addTableRows],
  shapes: {
    [TABLE_TYPE]: (_editor, shape) =>
      isTableShape(shape)
        ? {
            widget: "live table",
            title: shape.props.title || undefined,
            layout: shape.props.layout,
            rows: shape.props.rows.length,
            points: shape.props.rows.slice(0, 60).map((row) => row.point),
          }
        : null,
  },
}
