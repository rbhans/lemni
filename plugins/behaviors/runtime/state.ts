"use client"

import { atom, react } from "tldraw"

import type { PointKind } from "@/studio/data/live-points"

import type { InputValue } from "../core/evaluate"
import type { Behavior, PointRef } from "../core/model"

function persistedFlag(key: string, initial: boolean) {
  let start = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw === "true" || raw === "false") start = raw === "true"
  } catch {
    // Storage blocked; use the default.
  }
  const flag = atom(key, start)
  react(`persist ${key}`, () => {
    try {
      localStorage.setItem(key, String(flag.get()))
    } catch {
      // Ignore.
    }
  })
  return flag
}

/** Live effects on the canvas. Off shows the saved drawing, e.g. for arranging. */
export const liveEffects = persistedFlag("lemni.live-effects.v1", true)

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
