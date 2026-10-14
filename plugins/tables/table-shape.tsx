"use client"

import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { registerShapeLabel } from "@/studio/lib/shape-labels"

import type { TableColumns, TableLayout, TableRowRef } from "./model"
import { LiveTable } from "./live-table"

export const TABLE_TYPE = "bas-table"

export interface TableShapeProps {
  w: number
  h: number
  /** Empty: "Points" (list) or "Equipment" (pivot). */
  title: string
  layout: TableLayout
  rows: TableRowRef[]
  columns: TableColumns
  /** Column id to sort by ("" keeps the order points were added). */
  sortBy: string
  sortDesc: boolean
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [TABLE_TYPE]: TableShapeProps
  }
}

export type TableShape = TLShape<typeof TABLE_TYPE>

export const isTableShape = (
  shape: TLShape | undefined | null
): shape is TableShape => shape?.type === TABLE_TYPE

registerShapeLabel(TABLE_TYPE, () => "Table")

const RADIUS = 12

export class TableShapeUtil extends ShapeUtil<TableShape> {
  static override type = TABLE_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    layout: T.literalEnum("list", "equipment"),
    rows: T.arrayOf(
      T.object({ source: T.string, point: T.string, label: T.string })
    ),
    columns: T.object({
      equipment: T.boolean,
      status: T.boolean,
      updated: T.boolean,
    }),
    sortBy: T.string,
    sortDesc: T.boolean,
  }

  getDefaultProps(): TableShapeProps {
    return {
      w: 420,
      h: 240,
      title: "",
      layout: "list",
      rows: [],
      columns: { equipment: true, status: true, updated: false },
      sortBy: "",
      sortDesc: false,
    }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: TableShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: TableShape, info: TLResizeInfo<TableShape>) {
    return resizeBox(shape, info, { minWidth: 220, minHeight: 96 })
  }

  component(shape: TableShape) {
    return (
      <HTMLContainer>
        <LiveTable shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: TableShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, RADIUS)
    return path
  }

  override toSvg(shape: TableShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <LiveTable shape={shape} exporting />
      </foreignObject>
    )
  }
}
