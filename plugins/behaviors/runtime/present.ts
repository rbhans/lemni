"use client"

import { react, type Editor, type TLShape, type TLShapeId } from "tldraw"

import { goTo } from "@/studio/navigation/navigate"
import { currentPageKind, pageKindOf } from "@/studio/pages/page-categories"
import { studioState } from "@/studio/state"

import type { Behavior } from "../core/model"
import { effectiveBehaviors } from "./shapes"

/** The click behavior that applies to a shape: its own, or its nearest group's. */
function clickBehavior(
  editor: Editor,
  shape: TLShape | undefined
): Behavior | null {
  let current = shape
  while (current) {
    const found = effectiveBehaviors(editor, current.id).find(
      (b) => b.enabled && b.effect === "navigate"
    )
    if (found) return found
    const parent = editor.getShape(current.parentId as TLShapeId)
    current = parent?.type === "group" ? parent : undefined
  }
  return null
}

/** Follows a navigate behavior's target (any target the shared picker makes). */
export function navigateTo(editor: Editor, target: string, framing: string) {
  goTo(editor, target, framing === "center" ? "center" : "fit")
}

/**
 * Present mode: the board is read-only, chrome is hidden (by the shell), and clicking
 * a shape with an "On click" behavior runs it. Escape leaves.
 */
export function installPresentMode(editor: Editor): () => void {
  let wasReadonly = false
  let hadGrid = false
  let showingPointer = false
  const container = editor.getContainer()

  // The canvas owns its cursor, so go through tldraw rather than styling the container.
  const setPointer = (pointer: boolean) => {
    if (pointer === showingPointer) return
    showingPointer = pointer
    editor.setCursor({ type: pointer ? "pointer" : "grab", rotation: 0 })
  }

  // Panning with the hand tool shouldn't count as a click when it ends over a button.
  let down: { x: number; y: number } | null = null
  const onPointerDown = (event: PointerEvent) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!studioState.presenting.get() || event.button !== 0 || !down) return
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    down = null
    if (moved > 4) return
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
    const behavior = clickBehavior(
      editor,
      editor.getShapeAtPoint(point, { hitInside: true, margin: 2 })
    )
    if (!behavior) return
    const target =
      typeof behavior.params.target === "string" ? behavior.params.target : ""
    if (target)
      navigateTo(
        editor,
        target,
        typeof behavior.params.framing === "string"
          ? behavior.params.framing
          : "fit"
      )
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && studioState.presenting.get())
      studioState.presenting.set(false)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!studioState.presenting.get() || event.buttons !== 0) return
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
    setPointer(
      !!clickBehavior(
        editor,
        editor.getShapeAtPoint(point, { hitInside: true, margin: 2 })
      )
    )
  }

  container.addEventListener("pointerdown", onPointerDown, true)
  container.addEventListener("pointerup", onPointerUp, true)
  container.addEventListener("pointermove", onPointerMove, true)
  window.addEventListener("keydown", onKeyDown, true)

  let wasPresenting = false
  const stop = react("present mode", () => {
    const presenting = studioState.presenting.get()
    // Only act on the flip. Reads below touch instance state (cursor, grid), which
    // would otherwise re-run this and overwrite what we saved on entry.
    if (presenting === wasPresenting) return
    wasPresenting = presenting
    if (presenting) {
      // Present mode shows UI pages only.
      if (currentPageKind(editor) !== "ui") {
        const first = editor
          .getPages()
          .find((page) => pageKindOf(editor, page.id) === "ui")
        if (first) editor.setCurrentPage(first.id)
      }
      wasReadonly = editor.getIsReadonly()
      hadGrid = editor.getInstanceState().isGridMode
      editor.selectNone()
      editor.setCurrentTool("hand")
      editor.updateInstanceState({ isReadonly: true, isGridMode: false })
    } else {
      showingPointer = false
      if (hadGrid) editor.updateInstanceState({ isGridMode: true })
      hadGrid = false
      if (!wasReadonly && editor.getIsReadonly()) {
        editor.updateInstanceState({ isReadonly: false })
        editor.setCurrentTool("select")
      }
    }
  })

  return () => {
    stop()
    container.removeEventListener("pointerdown", onPointerDown, true)
    container.removeEventListener("pointerup", onPointerUp, true)
    container.removeEventListener("pointermove", onPointerMove, true)
    window.removeEventListener("keydown", onKeyDown, true)
    studioState.presenting.set(false)
  }
}
