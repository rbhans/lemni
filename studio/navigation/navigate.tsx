"use client"

import { toast } from "sonner"
import { atom, type Editor, type TLPageId, type TLShapeId } from "tldraw"

import { getDataSource } from "../data/live-points"
import { shapePageLabel, showShapePage } from "../links/links"
import { shapeDisplayName } from "../lib/shape-names"
import { studioState } from "../state"
import { parseTarget, type NavTarget } from "./targets"

// Shared navigation for anything a click can follow: behaviors' "On click: go to",
// UI buttons, and whatever else needs it.

export type Framing = "fit" | "center"

const ANIMATION = { animation: { duration: 280 } }

/** Follows a target. Outside Present mode, a shape it lands on is selected. */
export function goTo(
  editor: Editor,
  target: NavTarget | string | null,
  framing: Framing = "fit"
) {
  const t = typeof target === "string" ? parseTarget(target) : target
  if (!t) return
  switch (t.kind) {
    case "url":
      window.open(t.href, "_blank", "noopener,noreferrer")
      return
    case "point": {
      const source = getDataSource(t.source)
      if (!source?.reveal) {
        toast.info(`Connect to the station to show ${t.label}.`)
        return
      }
      source.reveal(t.point)
      if (studioState.presenting.get())
        toast.info(`${t.label} is in the Station panel.`)
      return
    }
    case "page": {
      const pageId = t.pageId as TLPageId
      if (!editor.getPage(pageId)) return missing()
      editor.setCurrentPage(pageId)
      editor.zoomToFit(ANIMATION)
      return
    }
    case "shape":
    case "docPage": {
      const shape = editor.getShape(t.shapeId as TLShapeId)
      if (!shape) return missing()
      const pageId = editor.getAncestorPageId(shape)
      if (pageId && pageId !== editor.getCurrentPageId())
        editor.setCurrentPage(pageId)
      if (t.kind === "docPage") showShapePage(editor, shape, t.page)
      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) return
      if (!studioState.presenting.get()) editor.select(shape.id)
      if (framing === "center") editor.centerOnPoint(bounds.center, ANIMATION)
      else editor.zoomToBounds(bounds, { inset: 80, ...ANIMATION })
    }
  }
}

function missing() {
  toast.info("That isn't on the board anymore.")
}

/** What to call a target in settings and tooltips. */
export function targetLabel(
  editor: Editor,
  target: NavTarget | string | null
): string {
  const t = typeof target === "string" ? parseTarget(target) : target
  if (!t) return "Nothing"
  switch (t.kind) {
    case "url":
      return t.href.replace(/^https?:\/\//, "").replace(/\/$/, "")
    case "point":
      return t.label
    case "page":
      return editor.getPage(t.pageId as TLPageId)?.name ?? "Missing page"
    case "shape":
    case "docPage": {
      const shape = editor.getShape(t.shapeId as TLShapeId)
      if (!shape) return "Missing"
      const name = shapeDisplayName(shape)
      return t.kind === "docPage"
        ? `${name} · ${shapePageLabel(shape, t.page)}`
        : name
    }
  }
}

/** Where a target is, for lists: its page, "Station" or "Web". */
export function targetPlace(
  editor: Editor,
  target: NavTarget | string | null
): string {
  const t = typeof target === "string" ? parseTarget(target) : target
  if (!t) return ""
  if (t.kind === "url") return "Web"
  if (t.kind === "point") return "Station"
  if (t.kind === "page") return "Page"
  const shape = editor.getShape(t.shapeId as TLShapeId)
  const pageId = shape ? editor.getAncestorPageId(shape) : null
  return pageId ? (editor.getPage(pageId)?.name ?? "") : ""
}

// ---- Picking a target on the canvas ------------------------------------------------------

export interface TargetPick {
  /** What's being set, for the banner ("Go to for Occupied button"). */
  label: string
  /** Where to come back to when done. */
  returnTo: { pageId: TLPageId; shapeIds: TLShapeId[] }
  onPick(target: NavTarget): void
}

/** While set, the next click on the canvas picks a target instead of selecting. */
export const targetPick = atom<TargetPick | null>("target pick", null)

/** Starts picking; the current page and selection come back afterwards. */
export function startTargetPick(
  editor: Editor,
  label: string,
  onPick: (target: NavTarget) => void
) {
  targetPick.set({
    label,
    returnTo: {
      pageId: editor.getCurrentPageId(),
      shapeIds: editor.getSelectedShapeIds(),
    },
    onPick,
  })
}

/** Ends picking and goes back to where it started. */
export function endTargetPick(editor: Editor, picked: NavTarget | null) {
  const pick = targetPick.get()
  targetPick.set(null)
  if (!pick) return
  if (picked) pick.onPick(picked)
  const { pageId, shapeIds } = pick.returnTo
  if (editor.getPage(pageId) && editor.getCurrentPageId() !== pageId)
    editor.setCurrentPage(pageId)
  const still = shapeIds.filter((id) => editor.getShape(id))
  if (still.length) editor.select(...still)
  editor.focus()
}

/** The target for a click on the canvas: the shape there (a document's showing page), or the page. */
export function targetAt(
  editor: Editor,
  point: { x: number; y: number }
): NavTarget {
  const shape = editor.getShapeAtPoint(point, {
    hitInside: true,
    hitFrameInside: true,
    margin: 4,
  })
  if (!shape) return { kind: "page", pageId: editor.getCurrentPageId() }
  const { page, pageCount } = shape.props as {
    page?: unknown
    pageCount?: unknown
  }
  if (
    typeof page === "number" &&
    typeof pageCount === "number" &&
    pageCount > 1
  )
    return { kind: "docPage", shapeId: shape.id, page }
  return { kind: "shape", shapeId: shape.id }
}
