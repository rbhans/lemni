import type { TLShape } from "tldraw"

const TYPE_LABELS: Record<string, string> = {
  draw: "Freehand",
  highlight: "Highlight",
  text: "Text",
  note: "Note",
  arrow: "Arrow",
  line: "Line",
  frame: "Frame",
  group: "Group",
  image: "Image",
  video: "Video",
  embed: "Web embed",
  bookmark: "Bookmark",
}

type LabelFor = (shape: TLShape) => string | undefined

const custom = new Map<string, LabelFor>()

/** Lets a plugin name its own shape type (e.g. a symbol shows its title). */
export function registerShapeLabel(type: string, labelFor: LabelFor) {
  custom.set(type, labelFor)
}

function titleCase(value: string) {
  return value.replace(
    /(^|-)(\w)/g,
    (_, sep: string, ch: string) => (sep ? " " : "") + ch.toUpperCase()
  )
}

/** Human label for a shape's kind, e.g. "Rectangle", "Freehand", "Image". */
export function shapeLabel(shape: TLShape): string {
  const label = custom.get(shape.type)?.(shape)
  if (label) return label
  if (
    shape.type === "geo" &&
    "geo" in shape.props &&
    typeof shape.props.geo === "string"
  ) {
    return titleCase(shape.props.geo)
  }
  return TYPE_LABELS[shape.type] ?? titleCase(shape.type)
}
