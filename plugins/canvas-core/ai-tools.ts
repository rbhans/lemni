"use client"

import {
  Box,
  createShapeId,
  type Editor,
  type TLPage,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from "tldraw"

import {
  categoryIdOf,
  createPageIn,
  kindOf,
  type AiBoardTool,
  type AiContribution,
  type AiToolContext,
  type JsonSchema,
} from "@/sdk"
import {
  applyUpdates,
  createFromSpecs,
  summarizeShape,
  shapeSpecSchema,
  shapeUpdateSchema,
  type ShapeSpec,
  type ShapeUpdate,
} from "./ai-shapes"

// Canvas tools for AI apps: read pages, see them, draw, change, arrange, and manage
// pages and the library. Coordinates are page coordinates (x right, y down).

const idList = (max: number): JsonSchema => ({
  type: "array",
  minItems: 1,
  maxItems: max,
  items: { type: "string" },
})

function pageOf(editor: Editor, pageId?: string): TLPage {
  if (!pageId) return editor.getCurrentPage()
  const page = editor.getPage(pageId as TLPageId)
  if (!page) throw new Error(`No page ${pageId}. board_overview lists them.`)
  return page
}

/** Shapes on a page in paint order (parents before their children). */
function shapesOn(editor: Editor, pageId: TLPageId): TLShape[] {
  const out: TLShape[] = []
  const walk = (parent: TLPageId | TLShapeId) => {
    for (const id of editor.getSortedChildIdsForParent(parent)) {
      const shape = editor.getShape(id)
      if (!shape) continue
      out.push(shape)
      walk(id)
    }
  }
  walk(pageId)
  return out
}

function existing(editor: Editor, ids: readonly string[]) {
  const found: TLShape[] = []
  const missing: string[] = []
  for (const id of ids) {
    const shape = editor.getShape(id as TLShapeId)
    if (shape) found.push(shape)
    else missing.push(id)
  }
  return { found, missing }
}

const pageInfo = (ctx: AiToolContext, page: TLPage) => {
  const category = ctx.categories().find((c) => c.id === categoryIdOf(page))
  return {
    id: page.id,
    name: page.name,
    category: category?.label ?? categoryIdOf(page),
    kind: kindOf(page),
  }
}

const readPage: AiBoardTool<{
  pageId?: string
  shapeIds?: string[]
  area?: "page" | "view"
  limit?: number
}> = {
  name: "read_page",
  title: "Read a page",
  access: "read",
  description:
    "Lists the shapes on a page (default: the page the person is on) as JSON: id, type, name or label, x/y/w/h in page coordinates, rotation, parent frame or group, text, styles, arrow ends, plus what plugins add (live widgets' points, document cards, behaviors, links). area 'view' keeps only what's in the person's view. Pass shapeIds to read specific shapes.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pageId: { type: "string" },
      shapeIds: idList(300),
      area: { type: "string", enum: ["page", "view"] },
      limit: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
  run(ctx, input) {
    const { editor } = ctx
    const page = pageOf(editor, input.pageId)
    let shapes = input.shapeIds
      ? existing(editor, input.shapeIds).found
      : shapesOn(editor, page.id)
    const isCurrent = page.id === editor.getCurrentPageId()
    const view = editor.getViewportPageBounds()
    if (input.area === "view" && isCurrent)
      shapes = shapes.filter((shape) => {
        const bounds = editor.getShapePageBounds(shape.id)
        return bounds ? Box.Collides(bounds, view) : false
      })
    const limit = input.limit ?? 200
    return {
      data: {
        page: pageInfo(ctx, page),
        ...(isCurrent
          ? {
              view: {
                x: Math.round(view.x),
                y: Math.round(view.y),
                w: Math.round(view.w),
                h: Math.round(view.h),
              },
            }
          : {}),
        total: shapes.length,
        ...(shapes.length > limit
          ? {
              note: `Showing the first ${limit}. Use area or shapeIds to narrow.`,
            }
          : {}),
        shapes: shapes.slice(0, limit).map((shape) => ctx.describeShape(shape)),
      },
    }
  },
}

const getSelection: AiBoardTool = {
  name: "get_selection",
  title: "See what's selected",
  access: "read",
  description:
    "The shapes the person has selected right now (what they mean by 'this' or 'these'), described like read_page.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run(ctx) {
    const shapes = ctx.editor.getSelectedShapes()
    return {
      text: shapes.length
        ? `${shapes.length} selected.`
        : "Nothing is selected.",
      data: shapes.slice(0, 100).map((shape) => ctx.describeShape(shape)),
    }
  },
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const screenshot: AiBoardTool<{
  pageId?: string
  shapeIds?: string[]
  area?: "page" | "view"
  maxSize?: number
}> = {
  name: "screenshot",
  title: "Take a screenshot",
  access: "read",
  timeoutMs: 45_000,
  description:
    "An image of the board: what the person sees (area 'view', the default on their page), a whole page (area 'page'), or specific shapes. Returns where the image's top-left is in page coordinates and the scale, so you can map what you see to positions.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pageId: { type: "string" },
      shapeIds: idList(300),
      area: { type: "string", enum: ["page", "view"] },
      maxSize: {
        type: "integer",
        minimum: 300,
        maximum: 1600,
        description: "Longest side in pixels (default 1200).",
      },
    },
  },
  async run(ctx, input) {
    const { editor } = ctx
    const page = pageOf(editor, input.pageId)
    const previous = editor.getCurrentPageId()
    const switched = page.id !== previous
    if (switched) editor.setCurrentPage(page.id)
    try {
      const area = input.shapeIds
        ? "shapes"
        : (input.area ?? (switched ? "page" : "view"))
      const ids = input.shapeIds
        ? existing(editor, input.shapeIds).found.map((s) => s.id)
        : [...editor.getCurrentPageShapeIds()]
      if (!ids.length)
        return {
          text: input.shapeIds
            ? "None of those shapes exist."
            : `"${page.name}" is empty.`,
        }
      const view = editor.getViewportPageBounds()
      const bounds =
        area === "view"
          ? view
          : Box.Common(
              ids.flatMap((id) => {
                const b = editor.getShapePageBounds(id)
                return b ? [b] : []
              })
            )
      const max = input.maxSize ?? 1200
      const scale = Math.min(2, max / Math.max(bounds.w, bounds.h, 1))
      const options = {
        scale,
        pixelRatio: 1,
        background: true,
        padding: area === "view" ? 0 : 16,
        ...(area === "view" ? { bounds: view } : {}),
      }
      let image = await editor.toImage(ids, { ...options, format: "png" })
      let mimeType: "image/png" | "image/jpeg" = "image/png"
      if (image.blob.size > 2_500_000) {
        image = await editor.toImage(ids, {
          ...options,
          format: "jpeg",
          quality: 0.85,
        })
        mimeType = "image/jpeg"
      }
      const pad = options.padding
      return {
        text: `Screenshot of "${page.name}" (${area}): ${Math.round(image.width)}×${Math.round(image.height)} px. The image's top-left is at page (${Math.round(bounds.x - pad)}, ${Math.round(bounds.y - pad)}); 1 px = ${(1 / scale).toFixed(2)} page units.`,
        images: [{ data: await blobToBase64(image.blob), mimeType }],
      }
    } finally {
      if (switched) editor.setCurrentPage(previous)
    }
  },
}

const createShapes: AiBoardTool<{ pageId?: string; shapes: ShapeSpec[] }> = {
  name: "create_shapes",
  title: "Draw shapes",
  access: "edit",
  description:
    "Adds shapes to a page (default: the person's page): geo kinds (rectangle, ellipse, diamond, …) with optional text, text, notes, frames, arrows and lines. Give a shape a ref to point arrows (from/to {shape: ref}) or children (parent: ref) at it in the same call. Colors are tldraw's named colors. Returns the new ids. For BAS equipment use the library (list_library) instead of drawing it.",
  inputSchema: {
    type: "object",
    required: ["shapes"],
    additionalProperties: false,
    properties: {
      pageId: { type: "string" },
      shapes: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: shapeSpecSchema,
      },
    },
  },
  run(ctx, input) {
    const { editor } = ctx
    const page = pageOf(editor, input.pageId)
    let result = {
      ids: [] as TLShapeId[],
      refs: {} as Record<string, TLShapeId>,
    }
    editor.run(() => {
      result = createFromSpecs(editor, page.id, input.shapes)
    })
    return {
      text: `Added ${result.ids.length} shape(s) to "${page.name}".`,
      data: { ids: result.ids, refs: result.refs },
    }
  },
}

const updateShapes: AiBoardTool<{ updates: ShapeUpdate[] }> = {
  name: "update_shapes",
  title: "Change shapes",
  access: "edit",
  description:
    "Changes shapes: move (x/y = new top-left in page coordinates), resize (w/h), rotate (degrees), text, name, geo kind, styles, parent (a frame/group id, or null for the page), hidden. Works on plugin shapes for position, size, name and hidden. Locked shapes are skipped.",
  inputSchema: {
    type: "object",
    required: ["updates"],
    additionalProperties: false,
    properties: {
      updates: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: shapeUpdateSchema,
      },
    },
  },
  run({ editor }, input) {
    let result: ReturnType<typeof applyUpdates> = { updated: [], skipped: [] }
    editor.run(() => {
      result = applyUpdates(editor, input.updates)
    })
    return {
      text: `Changed ${result.updated.length} shape(s).${result.skipped.length ? ` Skipped ${result.skipped.length}.` : ""}`,
      data: result.skipped.length ? { skipped: result.skipped } : undefined,
    }
  },
}

const deleteShapes: AiBoardTool<{ ids: string[] }> = {
  name: "delete_shapes",
  title: "Remove shapes",
  access: "edit",
  description:
    "Removes shapes (and what's inside frames and groups). Locked shapes are skipped. Removing a linked frame also removes its links. The person can undo.",
  inputSchema: {
    type: "object",
    required: ["ids"],
    additionalProperties: false,
    properties: { ids: idList(500) },
  },
  run({ editor }, input) {
    const { found, missing } = existing(editor, input.ids)
    const locked = found.filter((shape) => shape.isLocked)
    const ids = found
      .filter((shape) => !shape.isLocked)
      .map((shape) => shape.id)
    if (ids.length) editor.deleteShapes(ids)
    return {
      text: `Removed ${ids.length} shape(s).`,
      data:
        missing.length || locked.length
          ? { notFound: missing, locked: locked.map((s) => s.id) }
          : undefined,
    }
  },
}

const ARRANGE = [
  "align-left",
  "align-center-horizontal",
  "align-right",
  "align-top",
  "align-center-vertical",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
  "stack-horizontal",
  "stack-vertical",
  "bring-to-front",
  "bring-forward",
  "send-backward",
  "send-to-back",
  "group",
  "ungroup",
  "frame",
] as const

const arrangeShapes: AiBoardTool<{
  ids: string[]
  action: (typeof ARRANGE)[number]
  gap?: number
  name?: string
}> = {
  name: "arrange_shapes",
  title: "Arrange shapes",
  access: "edit",
  description:
    "Aligns, distributes, stacks (with gap), reorders, groups or ungroups shapes, or wraps them in a new frame (action 'frame', with an optional name). Frames are how people organize and link things.",
  inputSchema: {
    type: "object",
    required: ["ids", "action"],
    additionalProperties: false,
    properties: {
      ids: idList(300),
      action: { type: "string", enum: ARRANGE },
      gap: { type: "number", minimum: 0, maximum: 2000 },
      name: { type: "string", maxLength: 200 },
    },
  },
  run({ editor }, input) {
    const { found } = existing(editor, input.ids)
    const ids = found.filter((s) => !s.isLocked).map((s) => s.id)
    if (!ids.length) throw new Error("None of those shapes can be arranged.")
    const need = (n: number) => {
      if (ids.length < n) throw new Error(`That needs at least ${n} shapes.`)
    }
    const action = input.action
    if (action.startsWith("align-")) {
      need(2)
      editor.alignShapes(
        ids,
        action.slice(6) as Parameters<Editor["alignShapes"]>[1]
      )
    } else if (action.startsWith("distribute-")) {
      need(3)
      editor.distributeShapes(
        ids,
        action.slice(11) as "horizontal" | "vertical"
      )
    } else if (action.startsWith("stack-")) {
      need(2)
      editor.stackShapes(
        ids,
        action.slice(6) as "horizontal" | "vertical",
        input.gap ?? 24
      )
    } else if (action === "bring-to-front") editor.bringToFront(ids)
    else if (action === "bring-forward") editor.bringForward(ids)
    else if (action === "send-backward") editor.sendBackward(ids)
    else if (action === "send-to-back") editor.sendToBack(ids)
    else if (action === "group") {
      need(2)
      editor.groupShapes(ids)
      return {
        text: "Grouped.",
        data: { group: editor.getOnlySelectedShapeId() },
      }
    } else if (action === "ungroup") editor.ungroupShapes(ids)
    else if (action === "frame") {
      const boxes = ids.flatMap((id) => {
        const b = editor.getShapePageBounds(id)
        return b ? [b] : []
      })
      const bounds = Box.Common(boxes).expandBy(32)
      const pageId = editor.getAncestorPageId(ids[0])
      if (!pageId) throw new Error("Those shapes aren't on a page.")
      const frame = createShapeId()
      editor.createShape({
        id: frame,
        type: "frame",
        parentId: pageId,
        x: bounds.x,
        y: bounds.y,
        props: { w: bounds.w, h: bounds.h, name: input.name ?? "" },
      })
      editor.reparentShapes(ids, frame)
      return { text: "Wrapped in a frame.", data: { frame } }
    }
    return { text: "Arranged." }
  },
}

const createPage: AiBoardTool<{ category: string; name?: string }> = {
  name: "create_page",
  title: "Add a page",
  access: "edit",
  description:
    "Adds a page to a category (ids from board_overview, e.g. 'ui' or 'documents') and opens it. Returns its id.",
  inputSchema: {
    type: "object",
    required: ["category"],
    additionalProperties: false,
    properties: {
      category: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
  run(ctx, input) {
    const category = ctx.categories().find((c) => c.id === input.category)
    if (!category) throw new Error(`No category ${input.category}.`)
    if (category.kind === "wiresheet")
      throw new Error("The wire sheet is generated; it can't get more pages.")
    const id = createPageIn(ctx.editor, category)
    if (input.name) ctx.editor.renamePage(id, input.name)
    return {
      text: `Added "${ctx.editor.getPage(id)?.name}".`,
      data: { pageId: id },
    }
  },
}

const renamePage: AiBoardTool<{ pageId: string; name: string }> = {
  name: "rename_page",
  title: "Rename a page",
  access: "edit",
  description: "Renames a page.",
  inputSchema: {
    type: "object",
    required: ["pageId", "name"],
    additionalProperties: false,
    properties: {
      pageId: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
  run({ editor }, input) {
    const page = pageOf(editor, input.pageId)
    editor.renamePage(page.id, input.name)
    return { text: `Renamed to "${input.name}".` }
  },
}

const goTo: AiBoardTool<{ pageId?: string; shapeIds?: string[] }> = {
  name: "go_to",
  title: "Show the person something",
  access: "read",
  description:
    "Moves the person's view: to a page (fits it), or to shapes (selects and frames them). Use it to point at what you're talking about.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { pageId: { type: "string" }, shapeIds: idList(200) },
  },
  run({ editor }, input) {
    if (input.shapeIds) {
      const { found } = existing(editor, input.shapeIds)
      if (!found.length) throw new Error("None of those shapes exist.")
      const pageId = editor.getAncestorPageId(found[0])
      if (pageId) editor.setCurrentPage(pageId)
      const here = found.filter((s) => editor.getAncestorPageId(s) === pageId)
      editor.select(...here.map((s) => s.id))
      editor.zoomToSelection({ animation: { duration: 260 } })
      return { text: `Showing ${here.length} shape(s).` }
    }
    const page = pageOf(editor, input.pageId)
    editor.setCurrentPage(page.id)
    editor.zoomToFit({ animation: { duration: 260 } })
    return { text: `Showing "${page.name}".` }
  },
}

const listLibrary: AiBoardTool<{ query?: string; limit?: number }> = {
  name: "list_library",
  title: "Browse the library",
  access: "read",
  description:
    "Library items from enabled plugins (BAS equipment symbols and more), with ids for insert_library_item. Filter with a query (matches names and keywords). pageKinds says which pages a collection can be used on.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 100 },
      limit: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
  run(ctx, input) {
    const words = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    const items = ctx.libraryCollections.flatMap((collection) =>
      collection.items
        .filter((item) => {
          const text = [item.label, ...(item.keywords ?? []), collection.title]
            .join(" ")
            .toLowerCase()
          return words.every((word) => text.includes(word))
        })
        .map((item) => ({
          id: `${collection.id}/${item.id}`,
          label: item.label,
          collection: collection.title,
          tab: collection.tab.label,
          pageKinds: collection.pageKinds ?? ["ui"],
        }))
    )
    const limit = input.limit ?? 150
    return {
      text: `${items.length} item(s)${items.length > limit ? `, showing ${limit}` : ""}.`,
      data: items.slice(0, limit),
    }
  },
}

const insertLibraryItem: AiBoardTool<{
  item: string
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "insert_library_item",
  title: "Insert from the library",
  access: "edit",
  description:
    "Inserts a library item (id from list_library) centered at x/y in page coordinates (default: the middle of the person's view) on a page (default: theirs; the view switches to it). Returns the new shape ids; position or resize them with update_shapes.",
  inputSchema: {
    type: "object",
    required: ["item"],
    additionalProperties: false,
    properties: {
      item: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      pageId: { type: "string" },
    },
  },
  run(ctx, input) {
    const { editor } = ctx
    const slash = input.item.indexOf("/")
    const collection = ctx.libraryCollections.find(
      (c) => c.id === input.item.slice(0, slash)
    )
    const item = collection?.items.find(
      (i) => i.id === input.item.slice(slash + 1)
    )
    if (!collection || !item)
      throw new Error(
        `No library item ${input.item}. Use list_library for ids.`
      )
    const page = pageOf(editor, input.pageId)
    const kinds = collection.pageKinds ?? ["ui"]
    if (!kinds.includes(kindOf(page)))
      throw new Error(
        `"${collection.title}" items go on ${kinds.join(" or ")} pages, and "${page.name}" is a ${kindOf(page)} page.`
      )
    if (page.id !== editor.getCurrentPageId()) editor.setCurrentPage(page.id)
    const before = new Set(editor.getCurrentPageShapeIds())
    const center = editor.getViewportPageBounds().center
    item.insert(ctx, { x: input.x ?? center.x, y: input.y ?? center.y })
    const added = [...editor.getCurrentPageShapeIds()].filter(
      (id) => !before.has(id)
    )
    return { text: `Inserted ${item.label}.`, data: { ids: added } }
  },
}

export const canvasAi: AiContribution = {
  guide:
    "Pages hold shapes in page coordinates (x right, y down). read_page and screenshot show what's there; create_shapes, update_shapes, delete_shapes and arrange_shapes change it; list_library and insert_library_item add BAS equipment symbols. Put each piece of a graphic or drawing in a named frame.",
  tools: [
    readPage,
    getSelection,
    screenshot,
    createShapes,
    updateShapes,
    deleteShapes,
    arrangeShapes,
    createPage,
    renamePage,
    goTo,
    listLibrary,
    insertLibraryItem,
  ],
  shapes: { "*": summarizeShape },
}
