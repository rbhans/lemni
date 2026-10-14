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

import type { ChartRange, ChartSeries } from "./model"
import { TrendChart } from "./trend-chart"

export const CHART_TYPE = "bas-chart"

export interface ChartShapeProps {
  w: number
  h: number
  /** Empty: named after its point (one series) or "Trend". */
  title: string
  range: ChartRange
  series: ChartSeries[]
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CHART_TYPE]: ChartShapeProps
  }
}

export type ChartShape = TLShape<typeof CHART_TYPE>

export const isChartShape = (
  shape: TLShape | undefined | null
): shape is ChartShape => shape?.type === CHART_TYPE

registerShapeLabel(CHART_TYPE, () => "Trend chart")

export const MIN_CHART = { w: 240, h: 150 }
const RADIUS = 12

export class ChartShapeUtil extends ShapeUtil<ChartShape> {
  static override type = CHART_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    range: T.literalEnum("1h", "8h", "24h", "7d", "31d"),
    series: T.arrayOf(
      T.object({
        source: T.string,
        point: T.string,
        label: T.string,
        kind: T.literalEnum("number", "boolean"),
        units: T.string,
        slot: T.number,
      })
    ),
  }

  getDefaultProps(): ChartShapeProps {
    return { w: 480, h: 280, title: "", range: "24h", series: [] }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: ChartShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: ChartShape, info: TLResizeInfo<ChartShape>) {
    return resizeBox(shape, info, {
      minWidth: MIN_CHART.w,
      minHeight: MIN_CHART.h,
    })
  }

  component(shape: ChartShape) {
    return (
      <HTMLContainer>
        <TrendChart shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: ChartShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, RADIUS)
    return path
  }

  // Exports draw the same chart; tldraw inlines its styles into the SVG.
  override toSvg(shape: ChartShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <TrendChart shape={shape} exporting />
      </foreignObject>
    )
  }
}
