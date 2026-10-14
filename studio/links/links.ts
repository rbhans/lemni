"use client"

import { toast } from "sonner"
import {
  atom,
  useEditor,
  useValue,
  type Editor,
  type JsonValue,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from "tldraw"

import { getDataSource } from "../data/live-points"
import { isReplacingDocument } from "../files/board-files"
import { writeDocumentMeta } from "../lib/document-meta"
import { shapeDisplayName } from "../lib/shape-names"
import {
  endKey,
  prune,
  readLinks,
  shapeOf,
  withComment,
  withLink,
  withoutLink,
  type BoardLink,
  type LinkEnd,
} from "./model"

// Links live in the board's document settings, so they travel with the board file and
// undo with everything else. Plugins (Links, Station, Documents) use this API.

/** What Link Mark is holding, across pages. */
export const linkMark = atom<LinkEnd | null>("link mark", null)
/** A link that was just made and is waiting for its (optional) comment. */
export const pendingComment = atom<string | null>(
  "link waiting for comment",
  null
)
/** A link picked on the wire sheet, shown in the properties panel. */
export const selectedLink = atom<string | null>("selected link", null)

// ---- Linkable shapes ------------------------------------------------------------------

interface LinkableType {
  /** Shows a page of the shape (document cards). */
  showPage?(editor: Editor, shape: TLShape, page: number): void
  /** What to call one of its pages ("p. 3", or a Word section's heading). */
  pageLabel?(shape: TLShape, page: number): string
}

const linkable = new Map<string, LinkableType>([["frame", {}]])

/** Lets a plugin make its shape linkable (frames always are). */
export function registerLinkable(type: string, options: LinkableType = {}) {
  linkable.set(type, options)
}

export const isLinkable = (shape: TLShape | undefined | null) =>
  Boolean(shape && linkable.has(shape.type))

/** The link end for a shape, if it can be linked. */
export const endForShape = (
  shape: TLShape | undefined | null
): LinkEnd | null =>
  shape && isLinkable(shape) ? { kind: "shape", shapeId: shape.id } : null

/** The one linkable shape selected, if that's the selection. */
export function selectedEnd(editor: Editor): LinkEnd | null {
  const shapes = editor.getSelectedShapes()
  return shapes.length === 1 ? endForShape(shapes[0]) : null
}

// ---- Reading and writing --------------------------------------------------------------

export const getLinks = (editor: Editor) =>
  readLinks(editor.getDocumentSettings().meta)

export function useLinks(): BoardLink[] {
  const editor = useEditor()
  return useValue("links", () => getLinks(editor), [editor])
}

function saveLinks(editor: Editor, links: BoardLink[]) {
  writeDocumentMeta(editor, {
    ...editor.getDocumentSettings().meta,
    // Plain JSON objects; the interface just lacks an index signature.
    links: links as unknown as JsonValue,
  })
}

const newLinkId = () => `link:${crypto.randomUUID()}`

/** Links two things; says why when it can't. */
export function createLink(editor: Editor, a: LinkEnd, b: LinkEnd) {
  const result = withLink(getLinks(editor), a, b, newLinkId())
  if ("error" in result) {
    toast.info(result.error)
    return null
  }
  editor.markHistoryStoppingPoint("link")
  saveLinks(editor, result.links)
  return result.link
}

/** Adds several finished links at once (paste special). */
export function addLinks(editor: Editor, links: BoardLink[]) {
  if (links.length) saveLinks(editor, [...getLinks(editor), ...links])
}

export function deleteLink(editor: Editor, id: string) {
  editor.markHistoryStoppingPoint("remove link")
  saveLinks(editor, withoutLink(getLinks(editor), id))
  if (selectedLink.get() === id) selectedLink.set(null)
}

export function setLinkComment(editor: Editor, id: string, comment: string) {
  const link = getLinks(editor).find((l) => l.id === id)
  if (!link || link.comment === comment) return
  editor.markHistoryStoppingPoint("link comment")
  saveLinks(editor, withComment(getLinks(editor), id, comment.trim()))
}

export { newLinkId }

// ---- Link Mark ------------------------------------------------------------------------

export function markForLink(end: LinkEnd) {
  linkMark.set(end)
}

/**
 * Links `end` to whatever is marked, then asks for a comment. The mark stays, so one
 * thing can be linked to several others in a row.
 */
export function linkToMark(editor: Editor, end: LinkEnd) {
  const mark = linkMark.get()
  if (!mark) return null
  const link = createLink(editor, mark, end)
  if (link) pendingComment.set(link.id)
  return link
}

// ---- Describing and finding ends -------------------------------------------------------

/** What to call a link end. */
export function endLabel(editor: Editor, end: LinkEnd): string {
  switch (end.kind) {
    case "shape": {
      const shape = editor.getShape(end.shapeId as TLShapeId)
      return shape ? shapeDisplayName(shape) : "Missing"
    }
    case "docPage": {
      const shape = editor.getShape(end.shapeId as TLShapeId)
      if (!shape) return `Missing · p. ${end.page}`
      const page =
        linkable.get(shape.type)?.pageLabel?.(shape, end.page) ??
        `p. ${end.page}`
      return `${shapeDisplayName(shape)} · ${page}`
    }
    case "page":
      return editor.getPage(end.pageId as TLPageId)?.name ?? "Missing page"
    case "point":
      return end.label
  }
}

/** The page an end is on (null for station items). */
export function endPageId(editor: Editor, end: LinkEnd): TLPageId | null {
  if (end.kind === "page") return end.pageId as TLPageId
  const shape = shapeOf(end)
  if (!shape) return null
  return editor.getAncestorPageId(shape as TLShapeId) ?? null
}

/** Where an end is, for lists: its page's name, or "Station". */
export function endPlace(editor: Editor, end: LinkEnd): string {
  if (end.kind === "point") return "Station"
  if (end.kind === "page") return "Page"
  const pageId = endPageId(editor, end)
  return pageId ? (editor.getPage(pageId)?.name ?? "") : ""
}

export const endExists = (editor: Editor, end: LinkEnd) =>
  end.kind === "point"
    ? true
    : end.kind === "page"
      ? Boolean(editor.getPage(end.pageId as TLPageId))
      : Boolean(editor.getShape(end.shapeId as TLShapeId))

/** Takes you to an end: its page, framed and selected; station items in the Station panel. */
export function goToEnd(editor: Editor, end: LinkEnd) {
  if (end.kind === "point") {
    const source = getDataSource(end.source)
    if (source?.reveal) source.reveal(end.point)
    else toast.info(`Connect to the station to show ${end.label}.`)
    return
  }
  const pageId = endPageId(editor, end)
  if (!pageId) {
    toast.info("That isn't on the board anymore.")
    return
  }
  editor.setCurrentPage(pageId)
  if (end.kind === "page") {
    editor.zoomToFit({ animation: { duration: 220 } })
    return
  }
  const shape = editor.getShape(end.shapeId as TLShapeId)
  if (!shape) return
  editor.select(shape.id)
  editor.zoomToSelection({ animation: { duration: 220 } })
  if (end.kind === "docPage")
    linkable.get(shape.type)?.showPage?.(editor, shape, end.page)
}

// ---- Keeping links tidy ----------------------------------------------------------------

/**
 * Deleting a linked frame, card or page removes its links in the same change, so undo
 * brings both back. A toast says how many went.
 */
export function installLinkPruning(editor: Editor): () => void {
  let removed = 0
  let scheduled = false
  const report = () => {
    scheduled = false
    if (removed)
      toast.info(`Removed ${removed} link${removed === 1 ? "" : "s"}`)
    removed = 0
  }
  const drop = (gone: { shapes?: Set<string>; pages?: Set<string> }) => {
    if (isReplacingDocument()) return
    const result = prune(getLinks(editor), gone)
    if (!result.removed) return
    saveLinks(editor, result.links)
    removed += result.removed
    if (!scheduled) {
      scheduled = true
      queueMicrotask(report)
    }
  }
  const stopShapes = editor.sideEffects.registerAfterDeleteHandler(
    "shape",
    (shape) => drop({ shapes: new Set([shape.id]) })
  )
  const stopPages = editor.sideEffects.registerAfterDeleteHandler(
    "page",
    (page) => drop({ pages: new Set([page.id]) })
  )
  return () => {
    stopShapes()
    stopPages()
  }
}

export { endKey }
