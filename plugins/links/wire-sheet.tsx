"use client"

import {
  atom,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  useEditor,
  useValue,
  type Editor,
  type TLPage,
  type TLShape,
  type TLShapeId,
  type VecLike,
} from "tldraw"

import { cn } from "@/lib/utils"
import {
  categoryIdOf,
  createLink,
  endExists,
  endKey,
  endLabel,
  endPageId,
  endPlace,
  getLinks,
  isLinkable,
  kindOf,
  linksOf,
  pendingComment,
  registerShapeLabel,
  type LinkEnd,
} from "@/sdk"

import { layoutAll, NODE, placeNew } from "./layout"

export const NODE_TYPE = "bas-link-node"

export interface NodeShapeProps {
  w: number
  h: number
  /** What the box stands for. */
  end: LinkEnd
  /** Dragged in from the Links panel: stays even without links. */
  pinned: boolean
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [NODE_TYPE]: NodeShapeProps
  }
}

export type NodeShape = TLShape<typeof NODE_TYPE>

export const isNodeShape = (
  shape: TLShape | undefined | null
): shape is NodeShape => shape?.type === NODE_TYPE

registerShapeLabel(NODE_TYPE, () => "Wire sheet box")

/** A wire being dragged from a box's connector. */
export const wireDrag = atom<{ from: string; to: VecLike } | null>(
  "wire drag",
  null
)

// ---- Columns -------------------------------------------------------------------------

/** Documents left, then UI, then other categories, station items last. */
export function columnOf(editor: Editor, end: LinkEnd): number {
  const pageId = endPageId(editor, end)
  const page = pageId ? editor.getPage(pageId) : null
  if (!page) return 1000
  const kind = kindOf(page)
  const base = kind === "documents" ? 0 : kind === "ui" ? 100 : 200
  const categories = [
    ...new Set(
      editor
        .getPages()
        .filter((p) => kindOf(p) === kind)
        .map(categoryIdOf)
    ),
  ]
  return base + Math.max(0, categories.indexOf(categoryIdOf(page)))
}

/** Box stripe color for an end's column. */
export function stripeFor(editor: Editor, end: LinkEnd): string {
  if (end.kind === "point") return "bg-emerald-500"
  const pageId = endPageId(editor, end)
  const page = pageId ? editor.getPage(pageId) : null
  if (!page) return "bg-muted-foreground"
  const kind = kindOf(page)
  if (kind === "documents")
    return categoryIdOf(page) === "documents" ? "bg-amber-500" : "bg-orange-600"
  return categoryIdOf(page) === "ui" ? "bg-sky-500" : "bg-violet-500"
}

// ---- The box -------------------------------------------------------------------------

const linkEndValidator: T.Validatable<LinkEnd> = T.union("kind", {
  shape: T.object({ kind: T.literal("shape"), shapeId: T.string }),
  docPage: T.object({
    kind: T.literal("docPage"),
    shapeId: T.string,
    page: T.number,
  }),
  page: T.object({ kind: T.literal("page"), pageId: T.string }),
  point: T.object({
    kind: T.literal("point"),
    source: T.string,
    point: T.string,
    label: T.string,
  }),
})

export class NodeShapeUtil extends ShapeUtil<NodeShape> {
  static override type = NODE_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    end: linkEndValidator,
    pinned: T.boolean,
  }

  getDefaultProps(): NodeShapeProps {
    return {
      w: NODE.w,
      h: NODE.h,
      end: { kind: "page", pageId: "" },
      pinned: false,
    }
  }

  override canEdit() {
    return false
  }
  override canResize() {
    return false
  }
  override hideRotateHandle() {
    return true
  }

  getGeometry(shape: NodeShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  component(shape: NodeShape) {
    return (
      <HTMLContainer>
        <WireBox shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: NodeShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }
}

function WireBox({ shape }: { shape: NodeShape }) {
  const editor = useEditor()
  const end = shape.props.end
  const info = useValue(
    "wire box",
    () => ({
      label: endLabel(editor, end),
      place: endPlace(editor, end),
      count: linksOf(getLinks(editor), end).length,
      stripe: stripeFor(editor, end),
      exists: endExists(editor, end),
    }),
    [editor, end]
  )

  return (
    <div
      className={cn(
        "relative flex size-full items-center gap-2.5 rounded-lg border bg-card pr-4 pl-2.5 text-card-foreground shadow-xs",
        !info.exists && "opacity-50"
      )}
      style={{ pointerEvents: "all" }}
    >
      <span className={cn("h-8 w-1 shrink-0 rounded-full", info.stripe)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{info.label}</p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {info.place}
        </p>
      </div>
      <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
        {info.count}
      </span>
      <Connector end={end} />
    </div>
  )
}

/** Drag from here to another box to link them. */
function Connector({ end }: { end: LinkEnd }) {
  const editor = useEditor()
  return (
    <span
      role="button"
      aria-label="Drag to another box to link"
      title="Drag to another box to link"
      className="absolute top-1/2 -right-[7px] size-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card bg-muted-foreground/60 hover:bg-primary"
      onPointerDown={(event) => {
        if (event.button !== 0 || editor.getIsReadonly()) return
        event.stopPropagation()
        event.preventDefault()
        const from = endKey(end)
        const at = (e: PointerEvent | React.PointerEvent) =>
          editor.screenToPage({ x: e.clientX, y: e.clientY })
        wireDrag.set({ from, to: at(event) })
        const move = (e: PointerEvent) => wireDrag.set({ from, to: at(e) })
        const up = (e: PointerEvent) => {
          window.removeEventListener("pointermove", move)
          wireDrag.set(null)
          const hit = editor.getShapeAtPoint(at(e), { hitInside: true })
          if (!isNodeShape(hit) || endKey(hit.props.end) === from) return
          const link = createLink(editor, end, hit.props.end)
          if (link) pendingComment.set(link.id)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up, { once: true })
      }}
    />
  )
}

// ---- Keeping the sheet in step with the links ---------------------------------------

export const findWireSheet = (editor: Editor): TLPage | undefined =>
  editor.getPages().find((page) => kindOf(page) === "wiresheet")

export const nodesOn = (editor: Editor, page: TLPage) =>
  [...editor.getSortedChildIdsForParent(page.id)]
    .map((id) => editor.getShape(id))
    .filter(isNodeShape)

/** Everything that could be on the sheet when "show all" is on. */
function allLinkable(editor: Editor): LinkEnd[] {
  const out: LinkEnd[] = []
  for (const page of editor.getPages()) {
    if (kindOf(page) === "wiresheet") continue
    for (const id of editor.getPageShapeIds(page.id)) {
      const shape = editor.getShape(id)
      if (isLinkable(shape)) out.push({ kind: "shape", shapeId: id })
    }
  }
  return out
}

function wantedEnds(editor: Editor, page: TLPage): Map<string, LinkEnd> {
  const wanted = new Map<string, LinkEnd>()
  for (const link of getLinks(editor)) {
    wanted.set(endKey(link.a), link.a)
    wanted.set(endKey(link.b), link.b)
  }
  if (page.meta.showAll === true)
    for (const end of allLinkable(editor)) wanted.set(endKey(end), end)
  return wanted
}

/** Adds a box for an end (dragged in from the Links panel, say). */
export function addNode(
  editor: Editor,
  page: TLPage,
  end: LinkEnd,
  at: VecLike,
  pinned: boolean
) {
  const existing = nodesOn(editor, page).find(
    (n) => endKey(n.props.end) === endKey(end)
  )
  if (existing) {
    editor.updateShape({
      id: existing.id,
      type: NODE_TYPE,
      x: at.x,
      y: at.y,
      props: { pinned: existing.props.pinned || pinned },
    })
    return
  }
  editor.createShape({
    type: NODE_TYPE,
    parentId: page.id,
    x: at.x,
    y: at.y,
    props: { end, pinned },
  })
}

/** Lays every box out again (undoable). */
export function resortWireSheet(editor: Editor) {
  const page = findWireSheet(editor)
  if (!page) return
  const nodes = nodesOn(editor, page)
  const keyToId = new Map(nodes.map((n) => [endKey(n.props.end), n.id]))
  const positions = layoutAll(
    nodes.map((n) => ({
      key: endKey(n.props.end),
      column: columnOf(editor, n.props.end),
      label: endLabel(editor, n.props.end),
    })),
    getLinks(editor).map((link) => ({ a: endKey(link.a), b: endKey(link.b) }))
  )
  editor.markHistoryStoppingPoint("re-sort wire sheet")
  editor.updateShapes(
    [...positions].flatMap(([key, { x, y }]) => {
      const id = keyToId.get(key)
      return id ? [{ id, type: NODE_TYPE, x, y }] : []
    })
  )
}

/**
 * Keeps one box per linked thing on the wire sheet: adds boxes for new links, drops
 * boxes nothing links to (unless pinned or "show all" is on). These changes aren't
 * undo steps; the links they follow are.
 */
export function installWireSheet(editor: Editor): () => void {
  let queued = false

  const sync = () => {
    queued = false
    const page = findWireSheet(editor)
    if (!page) return
    const wanted = wantedEnds(editor, page)
    const nodes = nodesOn(editor, page)
    const seen = new Set<string>()
    const remove: TLShapeId[] = []
    for (const node of nodes) {
      const key = endKey(node.props.end)
      const keep =
        !seen.has(key) &&
        endExists(editor, node.props.end) &&
        (wanted.has(key) || node.props.pinned)
      if (keep) seen.add(key)
      else remove.push(node.id)
    }
    const add = [...wanted].filter(
      ([key, end]) => !seen.has(key) && endExists(editor, end)
    )
    if (!remove.length && !add.length) return

    editor.run(
      () => {
        if (remove.length) editor.deleteShapes(remove)
        const placed = nodesOn(editor, page).map((n) => ({
          column: columnOf(editor, n.props.end),
          x: n.x,
          y: n.y,
        }))
        for (const [, end] of add) {
          const column = columnOf(editor, end)
          const at = placeNew(placed, column)
          addNode(editor, page, end, at, false)
          placed.push({ column, ...at })
        }
      },
      { history: "ignore" }
    )
  }

  const schedule = () => {
    if (queued) return
    queued = true
    queueMicrotask(sync)
  }
  schedule()
  const stop = editor.store.listen(schedule, { scope: "document" })
  return stop
}
