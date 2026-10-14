"use client"

import { Mat, Vec, type Editor, type TLShape, type TLShapeId } from "tldraw"

import { getDataSource } from "@/studio/data/live-points"

import type { OwnerFrame } from "../core/effects"
import type { InputValue } from "../core/evaluate"
import {
  readBehaviors,
  refKey,
  serializeBehaviors,
  type Behavior,
  type PointRef,
  type ShapeBehaviors,
} from "../core/model"
import type { OwnerEntry, ReadValue } from "../core/presentation"
import { drafts, testValues } from "./state"

// Parsing is cached per stored array so reactive reads stay cheap.
const parsed = new WeakMap<object, ShapeBehaviors>()
const EMPTY: ShapeBehaviors = { behaviors: [], preserved: [] }

export function savedBehaviors(shape: TLShape | undefined): ShapeBehaviors {
  const raw = (shape?.meta as Record<string, unknown> | undefined)?.behaviors
  if (!Array.isArray(raw)) return EMPTY
  let result = parsed.get(raw)
  if (!result) {
    result = readBehaviors({ behaviors: raw })
    parsed.set(raw, result)
  }
  return result
}

/** What runs on the canvas: unsaved edits if any, otherwise what's saved. */
export function effectiveBehaviors(editor: Editor, id: TLShapeId): Behavior[] {
  return drafts.get()[id] ?? savedBehaviors(editor.getShape(id)).behaviors
}

export function writeBehaviors(
  editor: Editor,
  id: TLShapeId,
  behaviors: Behavior[],
  label = "edit behaviors"
) {
  const shape = editor.getShape(id)
  if (!shape) return
  const { preserved } = savedBehaviors(shape)
  editor.markHistoryStoppingPoint(label)
  editor.updateShape({
    id,
    type: shape.type,
    meta: {
      ...shape.meta,
      behaviors: serializeBehaviors(behaviors, preserved) as never,
    },
  })
}

/** Maps an owner's local space into the rendered shape's local space. */
function frameFor(
  editor: Editor,
  owner: TLShape,
  rendered: TLShape
): OwnerFrame {
  const bounds = editor.getShapeGeometry(owner).bounds
  const renderedTransform = editor.getShapePageTransform(rendered.id)
  const rotation = renderedTransform.rotation()
  if (owner.id === rendered.id) {
    return {
      w: bounds.w,
      h: bounds.h,
      point: (p) => ({ x: bounds.x + p.x, y: bounds.y + p.y }),
      vector: (v) => Vec.Rot(v, -rotation),
      isSelf: true,
    }
  }
  const ownerTransform = editor.getShapePageTransform(owner.id)
  const toRendered = Mat.Inverse(renderedTransform)
  return {
    w: bounds.w,
    h: bounds.h,
    point: (p) =>
      Mat.applyToPoint(
        toRendered,
        Mat.applyToPoint(ownerTransform, {
          x: bounds.x + p.x,
          y: bounds.y + p.y,
        })
      ),
    vector: (v) => Vec.Rot(v, -rotation),
    isSelf: false,
  }
}

/** The shape and its enclosing groups that carry behaviors, nearest first. */
export function collectOwners(editor: Editor, id: TLShapeId): OwnerEntry[] {
  const rendered = editor.getShape(id)
  if (!rendered) return []
  const owners: OwnerEntry[] = []
  let current: TLShape | undefined = rendered
  while (current) {
    const behaviors = effectiveBehaviors(editor, current.id)
    if (behaviors.length)
      owners.push({ behaviors, frame: frameFor(editor, current, rendered) })
    const parent: TLShape | undefined = editor.getShape(
      current.parentId as TLShapeId
    )
    current = parent?.type === "group" ? parent : undefined
  }
  return owners
}

/** Reads a point for a behavior: its test value (for its own source) or the live value. */
export const readValue: ReadValue = (
  ref: PointRef,
  behavior: Behavior
): InputValue | undefined => {
  const test = testValues.get()[behavior.id]
  if (test && behavior.source && refKey(ref) === refKey(behavior.source))
    return test
  return getDataSource(ref.source)?.value(ref.point).get()
}
