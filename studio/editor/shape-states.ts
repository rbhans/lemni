"use client"

// Shape states: named, typed bits of a shape's look that other plugins may drive at
// runtime (a symbol's "on", a tank's level). A shape util opts in by implementing
// `getShapeStates`; runtime values arrive through ShapeStateContext and are never
// written to the document.

import { createContext, useContext } from "react"
import type { Editor, TLShape } from "tldraw"

export interface ShapeStateDef {
  key: string
  label: string
  kind: "boolean" | "number"
  unit?: string
  min?: number
  max?: number
}

/** Implemented by shape utils whose shapes expose states. */
export interface ShapeStateSource {
  getShapeStates(shape: TLShape): ShapeStateDef[]
}

export function getShapeStates(
  editor: Editor,
  shape: TLShape | undefined
): ShapeStateDef[] {
  if (!shape) return []
  const util = editor.getShapeUtil(shape) as Partial<ShapeStateSource>
  return typeof util.getShapeStates === "function"
    ? util.getShapeStates(shape)
    : []
}

export type ShapeStateValues = Readonly<Record<string, boolean | number>>

/** Runtime state values for the shape being rendered (null when nothing drives it). */
export const ShapeStateContext = createContext<ShapeStateValues | null>(null)

export function useShapeStateOverrides(): ShapeStateValues | null {
  return useContext(ShapeStateContext)
}

/**
 * The Niagara status string of the point driving the shape being rendered (its first
 * bound behavior's point), or null. Symbols show it on their status plate.
 */
export const ShapeStatusContext = createContext<string | null>(null)

export function useShapeStatus(): string | null {
  return useContext(ShapeStatusContext)
}
