// Behavior data model: what is saved in shape.meta.behaviors. Pure (no React, no
// tldraw imports, relative imports only) so it runs under `node --test`.

export interface PointRef {
  /** Data source id, e.g. "niagara:https://10.0.0.20". */
  source: string
  /** Point id within the source, e.g. "slot:/Drivers/…/DA-T". */
  point: string
  /** Display name remembered for offline editing. */
  label?: string
}

export type SwitchTest =
  "true" | "false" | "equals" | "notEquals" | "above" | "below"

export interface SwitchMapping {
  kind: "switch"
  test: SwitchTest
  value?: string | number
}

export interface RangeMapping {
  kind: "range"
  inMin: number
  inMax: number
  outMin: number
  outMax: number
  clamp: boolean
}

export interface StateCase {
  match: string
  out: string
}

export interface StatesMapping {
  kind: "states"
  cases: StateCase[]
  fallback: string
}

export interface ValueMapping {
  kind: "value"
}

export type Mapping =
  SwitchMapping | RangeMapping | StatesMapping | ValueMapping

/** Extra "and …" gates: the behavior only runs while every condition holds. */
export interface Condition {
  ref: PointRef
  mapping: SwitchMapping
}

/** A number parameter that can follow a point instead of being fixed. */
export interface BoundNumber {
  bind: PointRef
  range: RangeMapping
}

export type ParamValue =
  string | number | boolean | null | BoundNumber | { x: number; y: number }

export interface Transition {
  ms: number
  easing: "linear" | "ease-in-out"
}

export interface Behavior {
  id: string
  v: 1
  effect: string
  name?: string
  enabled: boolean
  source: PointRef | null
  mapping: Mapping
  conditions: Condition[]
  params: Record<string, ParamValue>
  transition: Transition
}

export const META_KEY = "behaviors"
export const DEFAULT_TRANSITION: Transition = { ms: 400, easing: "ease-in-out" }

// ---- Parsing (tolerant: unknown or newer entries are preserved, never dropped) ------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

function parseRef(value: unknown): PointRef | null {
  if (
    !isObject(value) ||
    typeof value.source !== "string" ||
    typeof value.point !== "string"
  )
    return null
  return {
    source: value.source,
    point: value.point,
    ...(typeof value.label === "string" ? { label: value.label } : {}),
  }
}

function parseSwitch(value: unknown): SwitchMapping | null {
  if (!isObject(value) || value.kind !== "switch") return null
  const tests: SwitchTest[] = [
    "true",
    "false",
    "equals",
    "notEquals",
    "above",
    "below",
  ]
  if (!tests.includes(value.test as SwitchTest)) return null
  const v = value.value
  return {
    kind: "switch",
    test: value.test as SwitchTest,
    ...(typeof v === "string" || isFiniteNumber(v) ? { value: v } : {}),
  }
}

function parseRange(value: unknown): RangeMapping | null {
  if (!isObject(value) || value.kind !== "range") return null
  const { inMin, inMax, outMin, outMax } = value
  if (![inMin, inMax, outMin, outMax].every(isFiniteNumber)) return null
  return {
    kind: "range",
    inMin: inMin as number,
    inMax: inMax as number,
    outMin: outMin as number,
    outMax: outMax as number,
    clamp: value.clamp !== false,
  }
}

export function parseMapping(value: unknown): Mapping | null {
  if (!isObject(value)) return null
  switch (value.kind) {
    case "switch":
      return parseSwitch(value)
    case "range":
      return parseRange(value)
    case "states": {
      if (!Array.isArray(value.cases) || typeof value.fallback !== "string")
        return null
      const cases = value.cases.filter(
        (c): c is StateCase =>
          isObject(c) &&
          typeof c.match === "string" &&
          typeof c.out === "string"
      )
      return {
        kind: "states",
        cases: cases.map(({ match, out }) => ({ match, out })),
        fallback: value.fallback,
      }
    }
    case "value":
      return { kind: "value" }
    default:
      return null
  }
}

export function parseBoundNumber(value: unknown): BoundNumber | null {
  if (!isObject(value)) return null
  const bind = parseRef(value.bind)
  const range = parseRange(value.range)
  return bind && range ? { bind, range } : null
}

function parseParams(value: unknown): Record<string, ParamValue> {
  if (!isObject(value)) return {}
  const out: Record<string, ParamValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "boolean" ||
      isFiniteNumber(raw)
    )
      out[key] = raw
    else if (isObject(raw) && "bind" in raw) {
      const bound = parseBoundNumber(raw)
      if (bound) out[key] = bound
    } else if (isObject(raw) && isFiniteNumber(raw.x) && isFiniteNumber(raw.y))
      out[key] = { x: raw.x, y: raw.y }
  }
  return out
}

/** Returns a behavior, or null when the entry is unknown/newer and must be kept as-is. */
export function parseBehavior(value: unknown): Behavior | null {
  if (
    !isObject(value) ||
    value.v !== 1 ||
    typeof value.id !== "string" ||
    typeof value.effect !== "string"
  )
    return null
  const mapping = parseMapping(value.mapping)
  if (!mapping) return null
  const source = value.source === null ? null : parseRef(value.source)
  if (value.source !== null && !source) return null
  const conditions = Array.isArray(value.conditions)
    ? value.conditions.flatMap((c) => {
        if (!isObject(c)) return []
        const ref = parseRef(c.ref)
        const mapping = parseSwitch(c.mapping)
        return ref && mapping ? [{ ref, mapping }] : []
      })
    : []
  const transition =
    isObject(value.transition) && isFiniteNumber(value.transition.ms)
      ? {
          ms: Math.max(0, Math.min(10_000, value.transition.ms)),
          easing:
            value.transition.easing === "linear"
              ? ("linear" as const)
              : ("ease-in-out" as const),
        }
      : DEFAULT_TRANSITION
  return {
    id: value.id,
    v: 1,
    effect: value.effect,
    ...(typeof value.name === "string" && value.name
      ? { name: value.name }
      : {}),
    enabled: value.enabled !== false,
    source,
    mapping,
    conditions,
    params: parseParams(value.params),
    transition,
  }
}

export interface ShapeBehaviors {
  behaviors: Behavior[]
  /** Raw entries this version doesn't understand. Written back untouched. */
  preserved: unknown[]
}

export function readBehaviors(
  meta: Record<string, unknown> | undefined
): ShapeBehaviors {
  const raw = meta?.[META_KEY]
  if (!Array.isArray(raw)) return { behaviors: [], preserved: [] }
  const behaviors: Behavior[] = []
  const preserved: unknown[] = []
  for (const entry of raw) {
    const parsed = parseBehavior(entry)
    if (parsed) behaviors.push(parsed)
    else preserved.push(entry)
  }
  return { behaviors, preserved }
}

/** The value to store in meta.behaviors (JSON-safe). */
export function serializeBehaviors(
  behaviors: Behavior[],
  preserved: unknown[]
): unknown[] {
  return [
    ...behaviors.map((b) => JSON.parse(JSON.stringify(b)) as unknown),
    ...preserved,
  ]
}

export function newBehaviorId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

/** Every point a behavior reads: its source, conditions and bound parameters. */
export function pointsUsedBy(behavior: Behavior): PointRef[] {
  const refs: PointRef[] = []
  if (behavior.source) refs.push(behavior.source)
  for (const condition of behavior.conditions) refs.push(condition.ref)
  for (const param of Object.values(behavior.params)) {
    if (param && typeof param === "object" && "bind" in param)
      refs.push(param.bind)
  }
  return refs
}

export const refKey = (ref: PointRef) => `${ref.source}|${ref.point}`
