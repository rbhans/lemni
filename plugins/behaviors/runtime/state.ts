"use client"

import { atom } from "tldraw"

import { pluginStorage, type PointKind } from "@/sdk"

import type { InputValue } from "../core/evaluate"
import type { Behavior, PointRef } from "../core/model"

/** Live effects on the canvas. Off shows the saved drawing, e.g. for arranging. */
export const liveEffects = pluginStorage("behaviors").atom(
  "live-effects",
  true,
  (value): value is boolean => typeof value === "boolean",
  { from: ["lemscape.live-effects.v1"] }
)

/** Session-only test values per behavior, so effects can be checked without a station. */
export const testValues = atom<Record<string, InputValue | undefined>>(
  "behavior test values",
  {}
)

/** Unsaved edits per shape. The canvas previews them; Save writes them, Cancel drops them. */
export const drafts = atom<Record<string, Behavior[] | undefined>>(
  "behavior drafts",
  {}
)

/** A point dropped on a shape, waiting for the person to pick an effect. */
export const pendingAdd = atom<{
  shapeId: string
  ref: PointRef
  kind: PointKind | null
} | null>("pending behavior", null)

export function setTestValue(
  behaviorId: string,
  value: InputValue | undefined
) {
  testValues.update((all) => ({ ...all, [behaviorId]: value }))
}

export function setDraft(shapeId: string, behaviors: Behavior[] | undefined) {
  drafts.update((all) => {
    const next = { ...all }
    if (behaviors) next[shapeId] = behaviors
    else delete next[shapeId]
    return next
  })
}
