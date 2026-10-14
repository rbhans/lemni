"use client"

import { toast } from "sonner"
import type { Editor, TLShape, TLShapeId } from "tldraw"

import type { PointDragData } from "@/studio/data/live-points"
import type {
  PointDropContribution,
  StudioContext,
} from "@/studio/plugins/types"

import { pendingAdd } from "./state"

/**
 * Dropping a point (from the Station panel) on a shape selects the shape and opens
 * the Behavior tab with that point ready. Nothing is saved until an effect is chosen.
 * Runs last, so shapes that take points themselves (charts, tables) get them first.
 */
export const behaviorPointDrop: PointDropContribution = {
  id: "behavior",
  order: 100,
  target: (editor: Editor, hit: TLShape) =>
    editor.getOutermostSelectableShape(hit),
  drop(ctx: StudioContext, target: TLShape, [data]: PointDragData[]) {
    const { editor } = ctx
    if (editor.isShapeOrAncestorLocked(target)) {
      toast.error("That shape is locked. Unlock it to add behaviors.")
      return
    }
    editor.select(target.id)
    pendingAdd.set({
      shapeId: target.id as TLShapeId,
      ref: { source: data.source, point: data.point, label: data.label },
      kind: data.kind,
    })
    ctx.openInspectorTab("behavior")
  },
}
