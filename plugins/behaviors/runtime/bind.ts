"use client"

import type { Editor, TLShapeId } from "tldraw"

import { getShapeStates, type BindingRequest } from "@/sdk"

import {
  defaultsFor,
  findConflict,
  getEffect,
  stateDefaults,
  type StateOption,
} from "../core/effects"
import {
  DEFAULT_TRANSITION,
  newBehaviorId,
  parseBehavior,
  type ParamValue,
} from "../core/model"
import { savedBehaviors, writeBehaviors } from "./shapes"

/**
 * Adds a behavior with the effect's defaults for the point (the named state's, for
 * symbol states). Returns false when it wouldn't be valid or would fight another one.
 */
export function bindPoint(
  editor: Editor,
  shapeId: TLShapeId,
  { effect, params, point, kind }: BindingRequest
): boolean {
  const shape = editor.getShape(shapeId)
  const def = getEffect(effect)
  if (!shape || !def) return false
  const states: StateOption[] = getShapeStates(editor, shape).map(
    ({ key, label, kind, min, max }) => ({ key, label, kind, min, max })
  )
  const wanted =
    typeof params?.state === "string"
      ? states.find((s) => s.key === params.state)
      : undefined
  if (def.needsStates && !wanted && !states.length) return false
  const defaults = wanted
    ? stateDefaults(wanted, kind)
    : defaultsFor(def, kind, { states })
  const existing = savedBehaviors(shape).behaviors
  const behavior = parseBehavior(
    JSON.parse(
      JSON.stringify({
        id: newBehaviorId(),
        v: 1,
        effect: def.id,
        enabled: true,
        source: {
          source: point.source,
          point: point.point,
          label: point.label,
        },
        mapping: defaults.mapping,
        conditions: [],
        params: {
          ...defaults.params,
          ...(params as Record<string, ParamValue>),
        },
        transition: DEFAULT_TRANSITION,
      })
    )
  )
  if (!behavior) return false
  if (def.validate(behavior).length) return false
  if (findConflict(existing, behavior)) return false
  writeBehaviors(editor, shapeId, [...existing, behavior], "bind point")
  return true
}
