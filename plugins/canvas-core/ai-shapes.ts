"use client"

import {
  ArrowShapeArrowheadEndStyle,
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  toRichText,
  type Editor,
  type IndexKey,
  type TLPageId,
  type TLParentId,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw"

import type { JsonSchema } from "@/studio/ai/schema"
import {
  customShapeName,
  isHidden,
  shapeDisplayName,
} from "@/studio/lib/shape-names"
import { pageKindOf } from "@/studio/pages/page-categories"

// How shapes look to an AI app (a compact summary in page coordinates) and the simple
// specs it uses to draw: rectangles and other geo kinds, text, notes, frames, arrows and
// lines in tldraw's named styles.

const round = (n: number) => Math.round(n)
const ALIGN = ["start", "middle", "end"] as const

export const STYLE_VALUES = {
  color: DefaultColorStyle.values,
  fill: DefaultFillStyle.values,
  dash: DefaultDashStyle.values,
  size: DefaultSizeStyle.values,
  font: DefaultFontStyle.values,
}

export const GEO_KINDS = GeoShapeGeoStyle.values
const OTHER_KINDS = ["text", "note", "frame", "arrow", "line"] as const

// ---- Reading ------------------------------------------------------------------------

/** Where an arrow end is: the shape it's bound to, or a point on the page. */
function arrowEnds(editor: Editor, shape: TLShape) {
  const props = shape.props as {
    start: { x: number; y: number }
    end: { x: number; y: number }
  }
  const transform = editor.getShapePageTransform(shape.id)
  const bindings = editor.getBindingsFromShape(shape, "arrow")
  const end = (terminal: "start" | "end") => {
    const bound = bindings.find(
      (b) => (b.props as { terminal?: string }).terminal === terminal
    )
    if (bound) return { shape: bound.toId }
    const p = transform.applyToPoint(props[terminal])
    return { x: round(p.x), y: round(p.y) }
  }
  return { from: end("start"), to: end("end") }
}

/**
 * How any shape reads to an AI app: kind, name, bounds, text, styles, parent, arrow
 * ends. Canvas core contributes it for every shape; plugins add their own fields.
 */
export function summarizeShape(
  editor: Editor,
  shape: TLShape
): Record<string, unknown> {
  const props = shape.props as Record<string, unknown>
  const out: Record<string, unknown> = {
    id: shape.id,
    type: shape.type === "geo" ? props.geo : shape.type,
  }
  const name = customShapeName(shape)
  if (name) out.name = name
  else {
    const label = shapeDisplayName(shape)
    if (label) out.label = label
  }
  const bounds = editor.getShapePageBounds(shape.id)
  if (bounds)
    Object.assign(out, {
      x: round(bounds.x),
      y: round(bounds.y),
      w: round(bounds.w),
      h: round(bounds.h),
    })
  if (shape.rotation) out.rotation = round((shape.rotation * 180) / Math.PI)
  const parent = editor.getShape(shape.parentId as TLShapeId)
  if (parent) out.parent = parent.id
  const text = editor.getShapeUtil(shape).getText(shape)?.trim()
  if (text) out.text = text.length > 2000 ? `${text.slice(0, 2000)}…` : text
  for (const key of ["color", "fill", "dash", "size", "font"] as const)
    if (typeof props[key] === "string") out[key] = props[key]
  if (shape.type === "arrow") Object.assign(out, arrowEnds(editor, shape))
  if (shape.type === "frame" || shape.type === "group")
    out.children = editor.getSortedChildIdsForParent(shape.id).length
  if (shape.isLocked) out.locked = true
  if (isHidden(shape)) out.hidden = true
  return out
}

// ---- Specs --------------------------------------------------------------------------

type End = { x: number; y: number } | { shape: string }

export interface ShapeSpec {
  type: string
  ref?: string
  x?: number
  y?: number
  w?: number
  h?: number
  text?: string
  name?: string
  color?: string
  fill?: string
  dash?: string
  size?: string
  font?: string
  align?: string
  verticalAlign?: string
  parent?: string
  from?: End
  to?: End
  arrowheadStart?: string
  arrowheadEnd?: string
  bend?: number
}

const endSchema: JsonSchema = {
  anyOf: [
    {
      type: "object",
      required: ["x", "y"],
      additionalProperties: false,
      properties: { x: { type: "number" }, y: { type: "number" } },
    },
    {
      type: "object",
      required: ["shape"],
      additionalProperties: false,
      properties: {
        shape: {
          type: "string",
          description: "A shape id, or the ref of a shape made in this call.",
        },
      },
    },
  ],
}

const styleSchema = {
  color: { type: "string", enum: STYLE_VALUES.color },
  fill: { type: "string", enum: STYLE_VALUES.fill },
  dash: { type: "string", enum: STYLE_VALUES.dash },
  size: { type: "string", enum: STYLE_VALUES.size },
  font: { type: "string", enum: STYLE_VALUES.font },
  align: { type: "string", enum: ALIGN },
  verticalAlign: { type: "string", enum: DefaultVerticalAlignStyle.values },
} satisfies Record<string, JsonSchema>

export const shapeSpecSchema: JsonSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: [...GEO_KINDS, ...OTHER_KINDS],
      description:
        "A geo kind (rectangle, ellipse, diamond, …), or text, note, frame, arrow, line.",
    },
    ref: {
      type: "string",
      maxLength: 40,
      description:
        "Your own name for this shape, to point arrows or parents at it.",
    },
    x: { type: "number", description: "Left edge, page coordinates." },
    y: { type: "number", description: "Top edge, page coordinates." },
    w: { type: "number", minimum: 1, maximum: 20000 },
    h: { type: "number", minimum: 1, maximum: 20000 },
    text: { type: "string", maxLength: 10000 },
    name: { type: "string", maxLength: 200, description: "Frames show it." },
    ...styleSchema,
    parent: {
      type: "string",
      description: "A frame or group (id or ref) to put the shape in.",
    },
    from: endSchema,
    to: endSchema,
    arrowheadStart: {
      type: "string",
      enum: ArrowShapeArrowheadEndStyle.values,
    },
    arrowheadEnd: { type: "string", enum: ArrowShapeArrowheadEndStyle.values },
    bend: { type: "number", minimum: -2000, maximum: 2000 },
  },
}

export const shapeUpdateSchema: JsonSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    x: { type: "number", description: "New left edge (page coordinates)." },
    y: { type: "number", description: "New top edge (page coordinates)." },
    w: { type: "number", minimum: 1, maximum: 20000 },
    h: { type: "number", minimum: 1, maximum: 20000 },
    rotation: { type: "number", description: "Degrees." },
    text: { type: "string", maxLength: 10000 },
    name: { type: "string", maxLength: 200 },
    geo: { type: "string", enum: GEO_KINDS },
    ...styleSchema,
    parent: {
      type: ["string", "null"],
      description: "A frame or group id, or null to move it onto the page.",
    },
    hidden: { type: "boolean" },
  },
}

const textAlign = (align: string | undefined) =>
  align && (ALIGN as readonly string[]).includes(align) ? align : undefined

type Styled = Partial<
  Record<"color" | "fill" | "dash" | "size" | "font", string>
>

function styleProps(spec: Styled) {
  const out: Record<string, unknown> = {}
  for (const key of ["color", "fill", "dash", "size", "font"] as const)
    if (typeof spec[key] === "string") out[key] = spec[key]
  return out
}

/** Keeps only props the shape type has (a note has no fill, a frame no dash). */
function onlyKnown(
  editor: Editor,
  type: TLShape["type"],
  props: Record<string, unknown>
) {
  const util = editor.getShapeUtil(type)
  const defaults = util.getDefaultProps() as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => key in defaults)
  )
}

/**
 * Makes shapes from specs on a page. Arrows can point at shapes made in the same call
 * by their `ref`. Returns ids in spec order and the ref → id map.
 */
export function createFromSpecs(
  editor: Editor,
  pageId: TLPageId,
  specs: readonly ShapeSpec[]
): { ids: TLShapeId[]; refs: Record<string, TLShapeId> } {
  if (pageKindOf(editor, pageId) === "wiresheet")
    throw new Error(
      "The wire sheet is generated from links; use create_link instead of drawing on it."
    )
  const refs: Record<string, TLShapeId> = {}
  for (const spec of specs) if (spec.ref) refs[spec.ref] = createShapeId()
  const resolve = (idOrRef: string): TLShapeId | null => {
    if (refs[idOrRef]) return refs[idOrRef]
    const shape = editor.getShape(idOrRef as TLShapeId)
    return shape ? shape.id : null
  }

  // Check every reference first, so a bad one changes nothing.
  for (const [i, spec] of specs.entries()) {
    const at = `shapes[${i}]`
    if (spec.parent && !resolve(spec.parent))
      throw new Error(`${at}: no shape ${spec.parent} to put it in.`)
    for (const end of [spec.from, spec.to])
      if (end && "shape" in end && !resolve(end.shape))
        throw new Error(`${at}: no shape ${end.shape} for the arrow to reach.`)
    if (
      spec.type === "line" &&
      [spec.from, spec.to].some((e) => e && "shape" in e)
    )
      throw new Error(`${at}: lines don't attach to shapes; use an arrow.`)
  }

  const ids: TLShapeId[] = []
  const arrows: { id: TLShapeId; spec: ShapeSpec }[] = []
  const parents: { id: TLShapeId; parent: TLShapeId }[] = []

  for (const spec of specs) {
    const id = spec.ref ? refs[spec.ref] : createShapeId()
    ids.push(id)
    const x = spec.x ?? 0
    const y = spec.y ?? 0
    const base = { id, parentId: pageId as TLParentId, x, y }
    const styles = styleProps(spec)
    let partial: TLShapePartial

    if ((GEO_KINDS as readonly string[]).includes(spec.type)) {
      partial = {
        ...base,
        type: "geo",
        props: onlyKnown(editor, "geo", {
          geo: spec.type,
          w: spec.w ?? 160,
          h: spec.h ?? 100,
          ...styles,
          ...(spec.text !== undefined
            ? { richText: toRichText(spec.text) }
            : {}),
          ...(textAlign(spec.align) ? { align: spec.align } : {}),
          ...(spec.verticalAlign ? { verticalAlign: spec.verticalAlign } : {}),
        }),
      }
    } else if (spec.type === "text") {
      partial = {
        ...base,
        type: "text",
        props: onlyKnown(editor, "text", {
          richText: toRichText(spec.text ?? ""),
          ...styles,
          ...(textAlign(spec.align) ? { textAlign: spec.align } : {}),
          ...(spec.w ? { w: spec.w, autoSize: false } : {}),
        }),
      }
    } else if (spec.type === "note") {
      partial = {
        ...base,
        type: "note",
        props: onlyKnown(editor, "note", {
          richText: toRichText(spec.text ?? ""),
          ...styles,
          ...(textAlign(spec.align) ? { align: spec.align } : {}),
          ...(spec.verticalAlign ? { verticalAlign: spec.verticalAlign } : {}),
        }),
      }
    } else if (spec.type === "frame") {
      partial = {
        ...base,
        type: "frame",
        props: onlyKnown(editor, "frame", {
          w: spec.w ?? 640,
          h: spec.h ?? 400,
          name: spec.name ?? "",
          ...styles,
        }),
      }
    } else if (spec.type === "arrow" || spec.type === "line") {
      arrows.push({ id, spec })
      continue
    } else {
      throw new Error(`Unknown shape type "${spec.type}".`)
    }
    if (spec.name && spec.type !== "frame")
      partial = { ...partial, meta: { name: spec.name } }
    editor.createShape(partial)
    if (spec.parent) {
      const parent = resolve(spec.parent)
      if (!parent) throw new Error(`No shape ${spec.parent} to put it in.`)
      parents.push({ id, parent })
    }
  }

  // Arrows and lines last, so they can attach to shapes made above.
  for (const { id, spec } of arrows) {
    const point = (
      end: End | undefined,
      fallback: { x: number; y: number }
    ) => {
      if (!end) return { at: fallback, shape: null as TLShapeId | null }
      if ("shape" in end) {
        const target = resolve(end.shape)
        if (!target)
          throw new Error(`No shape ${end.shape} for the arrow to reach.`)
        const bounds = editor.getShapePageBounds(target)
        return { at: bounds ? bounds.center : fallback, shape: target }
      }
      return { at: { x: end.x, y: end.y }, shape: null }
    }
    const origin = { x: spec.x ?? 0, y: spec.y ?? 0 }
    const start = point(spec.from, origin)
    const end = point(spec.to, { x: start.at.x + 120, y: start.at.y })
    const delta = { x: end.at.x - start.at.x, y: end.at.y - start.at.y }

    if (spec.type === "line") {
      if (start.shape || end.shape)
        throw new Error("Lines don't attach to shapes; use an arrow for that.")
      editor.createShape({
        id,
        type: "line",
        parentId: pageId as TLParentId,
        x: start.at.x,
        y: start.at.y,
        props: onlyKnown(editor, "line", {
          ...styleProps(spec),
          points: {
            a1: { id: "a1", index: "a1" as IndexKey, x: 0, y: 0 },
            a2: { id: "a2", index: "a2" as IndexKey, x: delta.x, y: delta.y },
          },
        }),
        ...(spec.name ? { meta: { name: spec.name } } : {}),
      })
      continue
    }

    editor.createShape({
      id,
      type: "arrow",
      parentId: pageId as TLParentId,
      x: start.at.x,
      y: start.at.y,
      props: onlyKnown(editor, "arrow", {
        ...styleProps(spec),
        start: { x: 0, y: 0 },
        end: delta,
        ...(spec.text ? { richText: toRichText(spec.text) } : {}),
        ...(spec.arrowheadStart ? { arrowheadStart: spec.arrowheadStart } : {}),
        ...(spec.arrowheadEnd ? { arrowheadEnd: spec.arrowheadEnd } : {}),
        ...(spec.bend !== undefined ? { bend: spec.bend } : {}),
      }),
      ...(spec.name ? { meta: { name: spec.name } } : {}),
    })
    const bind = (terminal: "start" | "end", target: TLShapeId | null) => {
      if (!target) return
      editor.createBinding({
        type: "arrow",
        fromId: id,
        toId: target,
        props: {
          terminal,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: "none",
        },
      })
    }
    bind("start", start.shape)
    bind("end", end.shape)
  }

  for (const { id, parent } of parents) editor.reparentShapes([id], parent)
  return { ids, refs }
}

export interface ShapeUpdate {
  id: string
  x?: number
  y?: number
  w?: number
  h?: number
  rotation?: number
  text?: string
  name?: string
  geo?: string
  color?: string
  fill?: string
  dash?: string
  size?: string
  font?: string
  align?: string
  verticalAlign?: string
  parent?: string | null
  hidden?: boolean
}

/** Applies updates; returns ids it couldn't change, with why. */
export function applyUpdates(
  editor: Editor,
  updates: readonly ShapeUpdate[]
): { updated: TLShapeId[]; skipped: { id: string; why: string }[] } {
  const updated: TLShapeId[] = []
  const skipped: { id: string; why: string }[] = []
  for (const update of updates) {
    const shape = editor.getShape(update.id as TLShapeId)
    if (!shape) {
      skipped.push({ id: update.id, why: "not found" })
      continue
    }
    if (shape.isLocked) {
      skipped.push({ id: update.id, why: "locked by the person" })
      continue
    }
    const defaults = editor.getShapeUtil(shape).getDefaultProps() as Record<
      string,
      unknown
    >
    const props: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(styleProps(update)))
      if (key in defaults) props[key] = value
    if (update.geo && "geo" in defaults) props.geo = update.geo
    if (update.text !== undefined && "richText" in defaults)
      props.richText = toRichText(update.text)
    if (update.align !== undefined) {
      if ("align" in defaults) props.align = update.align
      else if ("textAlign" in defaults) props.textAlign = update.align
    }
    if (update.verticalAlign && "verticalAlign" in defaults)
      props.verticalAlign = update.verticalAlign
    if (update.w !== undefined && "w" in defaults) {
      props.w = update.w
      if ("autoSize" in defaults) props.autoSize = false
    }
    if (update.h !== undefined && "h" in defaults) props.h = update.h

    const partial: TLShapePartial = { id: shape.id, type: shape.type }
    if (Object.keys(props).length) partial.props = props
    if (update.rotation !== undefined)
      partial.rotation = (update.rotation * Math.PI) / 180
    if (update.name !== undefined) {
      if (shape.type === "frame")
        partial.props = { ...partial.props, name: update.name }
      else partial.meta = { ...partial.meta, name: update.name || null }
    }
    if (update.hidden !== undefined)
      partial.meta = { ...partial.meta, hidden: update.hidden }
    editor.updateShape(partial)

    if (update.parent !== undefined) {
      const target =
        update.parent === null
          ? editor.getAncestorPageId(shape.id)
          : editor.getShape(update.parent as TLShapeId)?.id
      if (!target) skipped.push({ id: update.id, why: "parent not found" })
      else editor.reparentShapes([shape.id], target)
    }
    if (update.x !== undefined || update.y !== undefined) {
      const bounds = editor.getShapePageBounds(shape.id)
      if (bounds)
        editor.nudgeShapes([shape.id], {
          x: update.x !== undefined ? update.x - bounds.x : 0,
          y: update.y !== undefined ? update.y - bounds.y : 0,
        })
    }
    updated.push(shape.id)
  }
  return { updated, skipped }
}
