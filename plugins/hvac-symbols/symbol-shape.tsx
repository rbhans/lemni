"use client"

import { useMemo, type CSSProperties } from "react"
import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useEditor,
  useValue,
  type SvgExportContext,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import {
  registerShapeLabel,
  useShapeStateOverrides,
  useShapeStatus,
  type ShapeStateDef,
  type ShapeStateSource,
} from "@/sdk"

import {
  DEFAULT_STATE,
  SHARED_CSS,
  getSymbol,
  resolveState,
  stateOptionsFor,
  stretchLength,
  symbolClasses,
  symbolMarkup,
  symbolVars,
  viewBoxFor,
  type SymbolPiece,
  type SymbolState,
} from "./library"
import { useSymbolStyles } from "./symbol-styles"

export const SYMBOL_TYPE = "bas-symbol"

export interface SymbolShapeProps extends SymbolState {
  /** Library id, e.g. "air/fan-centrifugal". */
  symbol: string
  w: number
  h: number
  flipX: boolean
  flipY: boolean
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [SYMBOL_TYPE]: SymbolShapeProps
  }
}

export type SymbolShape = TLShape<typeof SYMBOL_TYPE>

export const isSymbolShape = (
  shape: TLShape | undefined
): shape is SymbolShape => shape?.type === SYMBOL_TYPE

registerShapeLabel(SYMBOL_TYPE, (shape) =>
  isSymbolShape(shape) ? getSymbol(shape.props.symbol)?.title : undefined
)

function stateOf(props: SymbolShapeProps): SymbolState {
  const { on, ccw, flow, parallel, loaded, position, level, sash, text } = props
  return { on, ccw, flow, parallel, loaded, position, level, sash, text }
}

/** Everything needed to draw a piece at a size, shared by the canvas and SVG export. */
function drawing(
  piece: SymbolPiece,
  props: SymbolShapeProps,
  state: SymbolState,
  dark: boolean,
  status: string | null = null
) {
  const length = stretchLength(piece, props.w, props.h)
  return {
    viewBox: viewBoxFor(piece, length),
    className: symbolClasses(piece, state, {
      dark,
      flipX: props.flipX,
      flipY: props.flipY,
      status,
    }),
    vars: symbolVars(piece, state) as CSSProperties,
    markup: symbolMarkup(piece, { length, text: state.text }),
    // Equipment keeps its proportions; runs fill the box exactly.
    preserveAspectRatio: piece.stretch ? "none" : "xMidYMid meet",
  }
}

export class SymbolShapeUtil
  extends ShapeUtil<SymbolShape>
  implements ShapeStateSource
{
  static override type = SYMBOL_TYPE
  static override props = {
    symbol: T.string,
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    flipX: T.boolean,
    flipY: T.boolean,
    on: T.boolean,
    ccw: T.boolean,
    flow: T.boolean,
    parallel: T.boolean,
    loaded: T.boolean,
    position: T.number,
    level: T.number,
    sash: T.number,
    text: T.string,
  }

  getDefaultProps(): SymbolShapeProps {
    return {
      symbol: "air/fan-centrifugal",
      w: 120,
      h: 120,
      flipX: false,
      flipY: false,
      ...DEFAULT_STATE,
    }
  }

  override canEdit() {
    return false
  }

  override isAspectRatioLocked(shape: SymbolShape) {
    return !getSymbol(shape.props.symbol)?.stretch
  }

  getGeometry(shape: SymbolShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: SymbolShape, info: TLResizeInfo<SymbolShape>) {
    const resized = resizeBox(shape, info)
    const initial = info.initialShape.props
    return {
      ...resized,
      props: {
        ...resized.props,
        // Dragging past the opposite edge (or the Flip commands) mirrors the symbol.
        flipX: info.scaleX < 0 !== initial.flipX,
        flipY: info.scaleY < 0 !== initial.flipY,
      },
    }
  }

  getShapeStates(shape: TLShape): ShapeStateDef[] {
    if (!isSymbolShape(shape)) return []
    const piece = getSymbol(shape.props.symbol)
    return piece ? stateOptionsFor(piece) : []
  }

  component(shape: SymbolShape) {
    return <SymbolShapeView shape={shape} />
  }

  getIndicatorPath(shape: SymbolShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  override toSvg(shape: SymbolShape, ctx: SvgExportContext) {
    const piece = getSymbol(shape.props.symbol)
    if (!piece) return null
    const { w, h, flipX, flipY } = shape.props
    const d = drawing(piece, shape.props, stateOf(shape.props), ctx.isDarkMode)
    const flip =
      flipX || flipY
        ? `translate(${flipX ? w : 0} ${flipY ? h : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
        : undefined
    return (
      <g transform={flip}>
        <svg
          width={w}
          height={h}
          viewBox={d.viewBox}
          preserveAspectRatio={d.preserveAspectRatio}
          className={d.className}
          style={d.vars}
          dangerouslySetInnerHTML={{
            __html: `<style>${piece.css}${SHARED_CSS}</style>${d.markup}`,
          }}
        />
      </g>
    )
  }
}

function SymbolShapeView({ shape }: { shape: SymbolShape }) {
  const editor = useEditor()
  const dark = useValue("symbol dark", () => editor.getColorMode() === "dark", [
    editor,
  ])
  const overrides = useShapeStateOverrides()
  const status = useShapeStatus()
  const piece = getSymbol(shape.props.symbol)
  useSymbolStyles(piece)

  const state = resolveState(stateOf(shape.props), overrides)
  const d = piece ? drawing(piece, shape.props, state, dark, status) : null
  // Markup only changes with length or text, so state changes (classes, variables)
  // keep the same elements and the piece's own transitions and animations run.
  const html = useMemo(() => ({ __html: d?.markup ?? "" }), [d?.markup])

  if (!piece || !d) {
    return (
      <HTMLContainer className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/50 text-[11px] text-muted-foreground">
        Missing symbol “{shape.props.symbol}”
      </HTMLContainer>
    )
  }

  const flip =
    shape.props.flipX || shape.props.flipY
      ? `scale(${shape.props.flipX ? -1 : 1}, ${shape.props.flipY ? -1 : 1})`
      : undefined

  return (
    <HTMLContainer>
      <svg
        width="100%"
        height="100%"
        viewBox={d.viewBox}
        preserveAspectRatio={d.preserveAspectRatio}
        className={d.className}
        style={{
          ...d.vars,
          display: "block",
          overflow: "visible",
          transform: flip,
        }}
        dangerouslySetInnerHTML={html}
      />
    </HTMLContainer>
  )
}
