// Pure evaluation: live input → mapped output. No React or tldraw imports.

import type {
  BoundNumber,
  Mapping,
  ParamValue,
  RangeMapping,
  SwitchMapping,
} from "./model.ts"

/** The part of a live value the evaluator needs (matches studio/data LiveValue). */
export interface InputValue {
  value: unknown
  display: string
  ok: boolean
  status?: string
}

const TRUE_WORDS = new Set([
  "true",
  "on",
  "active",
  "occupied",
  "running",
  "open",
  "yes",
  "1",
  "enabled",
  "start",
])
const FALSE_WORDS = new Set([
  "false",
  "off",
  "inactive",
  "unoccupied",
  "stopped",
  "closed",
  "no",
  "0",
  "disabled",
  "stop",
])

/** Numeric reading of a value: numbers as-is, booleans 1/0, on/off words, "72.4 °F" → 72.4. */
export function toNumber(input: InputValue | undefined): number | null {
  if (!input) return null
  const { value } = input
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value ? 1 : 0
  const text = String(value ?? input.display)
    .trim()
    .toLowerCase()
  if (TRUE_WORDS.has(text)) return 1
  if (FALSE_WORDS.has(text)) return 0
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : null
}

/** Boolean reading: true/false, on/off style words, or any non-zero number. */
export function toBoolean(input: InputValue | undefined): boolean | null {
  if (!input) return null
  const { value } = input
  if (typeof value === "boolean") return value
  if (typeof value === "number")
    return Number.isFinite(value) ? value !== 0 : null
  for (const candidate of [value, input.display]) {
    const text = String(candidate ?? "")
      .trim()
      .toLowerCase()
    if (TRUE_WORDS.has(text)) return true
    if (FALSE_WORDS.has(text)) return false
  }
  const n = toNumber(input)
  return n === null ? null : n !== 0
}

function sameText(a: unknown, b: unknown) {
  return (
    String(a ?? "")
      .trim()
      .toLowerCase() ===
    String(b ?? "")
      .trim()
      .toLowerCase()
  )
}

export function evaluateSwitch(
  mapping: SwitchMapping,
  input: InputValue | undefined
): boolean | null {
  if (!input) return null
  switch (mapping.test) {
    case "true":
      return toBoolean(input)
    case "false": {
      const b = toBoolean(input)
      return b === null ? null : !b
    }
    case "equals":
      return (
        sameText(input.value, mapping.value) ||
        sameText(input.display, mapping.value)
      )
    case "notEquals":
      return !(
        sameText(input.value, mapping.value) ||
        sameText(input.display, mapping.value)
      )
    case "above":
    case "below": {
      const n = toNumber(input)
      const limit =
        typeof mapping.value === "number"
          ? mapping.value
          : Number.parseFloat(String(mapping.value))
      if (n === null || !Number.isFinite(limit)) return null
      return mapping.test === "above" ? n > limit : n < limit
    }
  }
}

export function evaluateRange(
  mapping: RangeMapping,
  input: InputValue | number | undefined
): number | null {
  const n = typeof input === "number" ? input : toNumber(input)
  if (n === null) return null
  const span = mapping.inMax - mapping.inMin
  if (span === 0) return mapping.outMin
  let t = (n - mapping.inMin) / span
  if (mapping.clamp) t = Math.min(1, Math.max(0, t))
  // Weighted form keeps the end points exact (t = 0 → outMin, t = 1 → outMax).
  return mapping.outMin * (1 - t) + mapping.outMax * t
}

export function evaluateStates(
  cases: { match: string; out: string }[],
  fallback: string,
  input: InputValue | undefined
): string | null {
  if (!input) return null
  // Exact text wins first, so "Occupied" can have its own color even though it reads as true.
  for (const c of cases) {
    if (sameText(input.value, c.match) || sameText(input.display, c.match))
      return c.out
  }
  // Then boolean points match "true"/"false" cases even when their text is "On"/"Off".
  const bool = toBoolean(input)
  if (bool !== null) {
    const hit = cases.find((c) => c.match === String(bool))
    if (hit) return hit.out
  }
  return fallback
}

export type Output =
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }

/**
 * Maps an input through a mapping. Null means "no usable value" (show the saved drawing).
 * `expect: "number"` reads a table's outputs as numbers (On → 100, Occupied → 72).
 */
export function evaluateMapping(
  mapping: Mapping,
  input: InputValue | undefined,
  expect?: "number"
): Output | null {
  switch (mapping.kind) {
    case "switch": {
      const value = evaluateSwitch(mapping, input)
      return value === null ? null : { kind: "boolean", value }
    }
    case "range": {
      const value = evaluateRange(mapping, input)
      return value === null ? null : { kind: "number", value }
    }
    case "states": {
      const value = evaluateStates(mapping.cases, mapping.fallback, input)
      if (value === null) return null
      if (expect !== "number") return { kind: "text", value }
      const n = Number.parseFloat(value)
      return Number.isFinite(n) ? { kind: "number", value: n } : null
    }
    case "value":
      return input ? { kind: "text", value: input.display } : null
  }
}

/** Resolves a number parameter that may be bound to a point. */
export function resolveNumber(
  param: ParamValue | undefined,
  fallback: number,
  read: (bound: BoundNumber) => InputValue | undefined
): number {
  if (typeof param === "number") return param
  if (param && typeof param === "object" && "bind" in param) {
    return evaluateRange(param.range, read(param)) ?? fallback
  }
  return fallback
}
