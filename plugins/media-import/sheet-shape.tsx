"use client"

import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { cn } from "@/lib/utils"
import { registerLinkable } from "@/studio/links/links"
import { registerShapeLabel } from "@/studio/lib/shape-labels"

export const SHEET_TYPE = "bas-sheet"

export interface SheetShapeProps {
  w: number
  h: number
  title: string
  columns: string[]
  rows: string[][]
  /** Data rows in the original sheet (more than `rows` when it was trimmed). */
  totalRows: number
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [SHEET_TYPE]: SheetShapeProps
  }
}

export type SheetShape = TLShape<typeof SHEET_TYPE>

export const isSheetShape = (
  shape: TLShape | undefined | null
): shape is SheetShape => shape?.type === SHEET_TYPE

registerShapeLabel(SHEET_TYPE, (shape) =>
  isSheetShape(shape) ? shape.props.title : undefined
)
registerLinkable(SHEET_TYPE)

const TITLE_H = 32
const ROW_H = 24

export class SheetShapeUtil extends ShapeUtil<SheetShape> {
  static override type = SHEET_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    columns: T.arrayOf(T.string),
    rows: T.arrayOf(T.arrayOf(T.string)),
    totalRows: T.number,
  }

  getDefaultProps(): SheetShapeProps {
    return {
      w: 560,
      h: 360,
      title: "Sheet",
      columns: [],
      rows: [],
      totalRows: 0,
    }
  }

  /** Double-click to scroll through every row. */
  override canEdit() {
    return true
  }

  getGeometry(shape: SheetShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: SheetShape, info: TLResizeInfo<SheetShape>) {
    return resizeBox(shape, info, { minWidth: 220, minHeight: 120 })
  }

  component(shape: SheetShape) {
    return (
      <HTMLContainer>
        <SheetView shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: SheetShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }

  override toSvg(shape: SheetShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <SheetView shape={shape} />
      </foreignObject>
    )
  }
}

/** A spreadsheet tab as a table: the rows that fit, or all of them while scrolling. */
function SheetView({ shape }: { shape: SheetShape }) {
  const editor = useEditor()
  const { title, columns, rows, totalRows, h } = shape.props
  const scrolling = useValue(
    "sheet scrolling",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id]
  )
  const fits = Math.max(1, Math.floor((h - TITLE_H - ROW_H - 2) / ROW_H) - 1)
  const shown = scrolling ? rows : rows.slice(0, fits)
  const hidden = rows.length - shown.length

  return (
    <div
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        scrolling && "ring-2 ring-primary/60"
      )}
      style={{ pointerEvents: "all" }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3"
        style={{ height: TITLE_H }}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {title}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {totalRows} rows
        </span>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1",
          scrolling ? "overflow-auto" : "overflow-hidden"
        )}
        // While scrolling the sheet, the wheel scrolls it instead of the board.
        onWheelCapture={
          scrolling ? (event) => event.stopPropagation() : undefined
        }
      >
        <table className="w-max min-w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {columns.map((name, i) => (
                <th
                  key={i}
                  className="h-6 max-w-48 truncate border-b px-2 text-left font-medium text-muted-foreground"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className="border-b last:border-b-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="h-6 max-w-48 truncate px-2 tabular-nums"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {hidden > 0 ? (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            {hidden} more rows · double-click to scroll
          </p>
        ) : null}
        {scrolling && totalRows > rows.length ? (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            The first {rows.length} of {totalRows} rows were kept.
          </p>
        ) : null}
      </div>
    </div>
  )
}
