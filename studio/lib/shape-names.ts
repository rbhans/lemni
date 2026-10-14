import type { Editor, TLShape, TLShapeId } from "tldraw"

import { shapeLabel } from "./shape-labels"

/** The name someone gave the shape, if any (frames keep theirs on the canvas). */
export function customShapeName(shape: TLShape): string | null {
  if (shape.type === "frame") {
    const name = (shape.props as { name?: unknown }).name
    return typeof name === "string" && name.trim() ? name : null
  }
  const name = (shape.meta as { name?: unknown }).name
  return typeof name === "string" && name.trim() ? name : null
}

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  const { text, content } = node as { text?: unknown; content?: unknown }
  if (typeof text === "string") return text
  if (Array.isArray(content)) return content.map(plainText).join(" ").trim()
  return ""
}

/** What to call a shape in lists: its name, else its text, else its kind. */
export function shapeDisplayName(shape: TLShape): string {
  const custom = customShapeName(shape)
  if (custom) return custom
  const richText = (shape.props as { richText?: unknown }).richText
  if (richText) {
    const text = plainText(richText)
    if (text) return text.slice(0, 40)
  }
  return shapeLabel(shape)
}

/** Renames a shape; an empty name clears it so the default label shows again. */
export function renameShape(editor: Editor, id: TLShapeId, name: string) {
  const shape = editor.getShape(id)
  if (!shape) return
  const next = name.trim()
  if ((customShapeName(shape) ?? "") === next) return
  editor.markHistoryStoppingPoint("rename shape")
  if (shape.type === "frame") {
    editor.updateShape({ id, type: shape.type, props: { name: next } })
    return
  }
  // tldraw merges meta key by key, so clearing writes null rather than dropping the key.
  editor.updateShape({ id, type: shape.type, meta: { name: next || null } })
}

export const isHidden = (shape: TLShape) =>
  (shape.meta as { hidden?: unknown }).hidden === true

/** Shows or hides shapes; hidden shapes aren't drawn or selectable but keep their place. */
export function setHidden(
  editor: Editor,
  ids: readonly TLShapeId[],
  hidden: boolean
) {
  const shapes = ids
    .map((id) => editor.getShape(id))
    .filter((s): s is TLShape => Boolean(s))
  if (!shapes.length) return
  editor.markHistoryStoppingPoint(hidden ? "hide shapes" : "show shapes")
  editor.run(() => {
    for (const shape of shapes) {
      // tldraw merges meta key by key, so showing writes false rather than dropping the key.
      editor.updateShape({ id: shape.id, type: shape.type, meta: { hidden } })
    }
    if (hidden) editor.deselect(...shapes.map((s) => s.id))
  })
}
