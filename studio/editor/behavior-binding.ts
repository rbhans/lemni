import type { Editor, TLShapeId } from "tldraw"

import type { PointKind, PointRef } from "../data/live-points"

// Lets a plugin that places shapes for a point (a fan symbol for a fan status) also make
// the shape react to it, without depending on the Behaviors plugin: Behaviors registers
// the binder while it's on; with it off, the shape is placed without a behavior.

export interface BindingRequest {
  /** A behavior effect id, e.g. "state", "label", "blink". */
  effect: string
  /** Effect parameters, e.g. { state: "position" }; the rest are the effect's defaults. */
  params?: Readonly<Record<string, string | number | boolean>>
  point: PointRef
  kind: PointKind | null
}

type Binder = (
  editor: Editor,
  shapeId: TLShapeId,
  request: BindingRequest
) => boolean

let binder: Binder | null = null

export function registerBehaviorBinder(fn: Binder): () => void {
  binder = fn
  return () => {
    if (binder === fn) binder = null
  }
}

/** Whether something can bind behaviors right now (the Behaviors plugin is on). */
export const canBindBehaviors = () => binder !== null

/** Adds a behavior to the shape; false when nothing can, or the request doesn't fit. */
export function bindBehavior(
  editor: Editor,
  shapeId: TLShapeId,
  request: BindingRequest
): boolean {
  return binder?.(editor, shapeId, request) ?? false
}
