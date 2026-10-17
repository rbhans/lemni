"use client"

import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useValue,
  type JsonValue,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { cn } from "@/lib/utils"
import { registerShapeLabel } from "@/studio/lib/shape-labels"
import { studioState } from "@/studio/state"

import { ElementView } from "./controls"
import {
  designHeight,
  KIND_LABEL,
  normalizeElement,
  PANEL_HEADER,
  PANEL_PADDING,
  PANEL_ROW,
  type UiElement,
} from "./model"

export const ELEMENT_TYPE = "bas-ui"
export const PANEL_TYPE = "bas-ui-panel"

export interface UiElementShapeProps {
  w: number
  h: number
  /** A UiElement; read through `normalizeElement`. */
  el: JsonValue
}

export interface UiPanelShapeProps {
  w: number
  h: number
  title: string
  /** UiElements, top to bottom. */
  rows: JsonValue
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [ELEMENT_TYPE]: UiElementShapeProps
    [PANEL_TYPE]: UiPanelShapeProps
  }
}

export type UiElementShape = TLShape<typeof ELEMENT_TYPE>
export type UiPanelShape = TLShape<typeof PANEL_TYPE>

export const isElementShape = (
  shape: TLShape | null | undefined
): shape is UiElementShape => shape?.type === ELEMENT_TYPE
export const isPanelShape = (
  shape: TLShape | null | undefined
): shape is UiPanelShape => shape?.type === PANEL_TYPE

export const elementOf = (shape: UiElementShape): UiElement =>
  normalizeElement(shape.props.el)
export const rowsOf = (shape: UiPanelShape): UiElement[] =>
  Array.isArray(shape.props.rows) ? shape.props.rows.map(normalizeElement) : []

registerShapeLabel(ELEMENT_TYPE, (shape) =>
  isElementShape(shape) ? KIND_LABEL[elementOf(shape).kind] : "UI element"
)
registerShapeLabel(PANEL_TYPE, () => "Panel")

/** Controls answer the pointer in Present mode; on the board they're shapes. */
function useInteractive() {
  return useValue(studioState.presenting)
}

function Live({
  interactive,
  className,
  children,
}: {
  interactive: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <HTMLContainer
      className={cn("ui-element", className)}
      style={{ pointerEvents: interactive ? "all" : "none" }}
      // Keep tldraw from treating a click on a control as a canvas gesture.
      onPointerDown={
        interactive ? (event) => event.stopPropagation() : undefined
      }
    >
      {children}
    </HTMLContainer>
  )
}

function ElementBody({ shape }: { shape: UiElementShape }) {
  const interactive = useInteractive()
  const el = elementOf(shape)
  // Laid out at its design height, then scaled to the shape: a taller shape is a bigger
  // control (text, switch and all), and extra width is room for the content.
  const scale = Math.max(0.2, shape.props.h / designHeight(el))
  return (
    <Live interactive={interactive}>
      <div
        style={{
          width: shape.props.w / scale,
          height: shape.props.h / scale,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <ElementView el={el} interactive={interactive} />
      </div>
    </Live>
  )
}

export class UiElementShapeUtil extends ShapeUtil<UiElementShape> {
  static override type = ELEMENT_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    el: T.jsonValue,
  }

  getDefaultProps(): UiElementShapeProps {
    return { w: 200, h: 40, el: { kind: "value" } }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: UiElementShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: UiElementShape, info: TLResizeInfo<UiElementShape>) {
    return resizeBox(shape, info, { minWidth: 60, minHeight: 24 })
  }

  component(shape: UiElementShape) {
    return <ElementBody shape={shape} />
  }

  getIndicatorPath(shape: UiElementShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }
}

function PanelBody({ shape }: { shape: UiPanelShape }) {
  const interactive = useInteractive()
  const rows = rowsOf(shape)
  const { title } = shape.props
  return (
    <Live interactive={interactive}>
      <div className="flex size-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        {title ? (
          <div
            className="flex shrink-0 items-center border-b px-3 text-sm font-semibold"
            style={{ height: PANEL_HEADER }}
          >
            <span className="truncate">{title}</span>
          </div>
        ) : null}
        <div
          className="flex flex-col px-3"
          style={{
            paddingTop: title ? 0 : PANEL_PADDING,
            paddingBottom: PANEL_PADDING,
          }}
        >
          {rows.length ? (
            rows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col justify-center",
                  i > 0 && "border-t border-border/60"
                )}
                style={{ height: PANEL_ROW }}
              >
                <ElementView el={row} interactive={interactive} row />
              </div>
            ))
          ) : (
            <p
              className="flex items-center text-xs text-muted-foreground"
              style={{ height: PANEL_ROW }}
            >
              Drop points here, or add rows in the properties panel.
            </p>
          )}
        </div>
      </div>
    </Live>
  )
}

export class UiPanelShapeUtil extends ShapeUtil<UiPanelShape> {
  static override type = PANEL_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    title: T.string,
    rows: T.jsonValue,
  }

  getDefaultProps(): UiPanelShapeProps {
    return { w: 300, h: 104, title: "Panel", rows: [] }
  }

  override canEdit() {
    return false
  }

  getGeometry(shape: UiPanelShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: UiPanelShape, info: TLResizeInfo<UiPanelShape>) {
    return resizeBox(shape, info, { minWidth: 200, minHeight: 60 })
  }

  component(shape: UiPanelShape) {
    return <PanelBody shape={shape} />
  }

  getIndicatorPath(shape: UiPanelShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }
}
