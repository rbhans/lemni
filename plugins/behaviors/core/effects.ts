// The effect registry: one entry per effect, holding everything that varies by effect
// (defaults, channel, validation, how its output changes the presentation). UI
// metadata (icons, editor fields) lives in ../ui/effect-ui.tsx. Pure module.

import { resolveNumber, type InputValue, type Output } from "./evaluate.ts"
import type {
  Behavior,
  BoundNumber,
  Mapping,
  ParamValue,
  RangeMapping,
  SwitchMapping,
} from "./model.ts"

export type Family = "display" | "appearance" | "motion" | "interaction"
export type ValueKind = "boolean" | "number" | "text"
export type OutputKind = "boolean" | "number" | "text" | "none"

export interface Vec {
  x: number
  y: number
}

/** Geometry of the behavior's owner, mapped into the rendered shape's local space. */
export interface OwnerFrame {
  w: number
  h: number
  /** Owner-local point → rendered-shape-local point. */
  point(p: Vec): Vec
  /** Page-space vector → rendered-shape-local vector. */
  vector(v: Vec): Vec
  isSelf: boolean
}

export type TransformOp =
  | { kind: "translate"; x: number; y: number }
  | { kind: "rotate"; deg: number; origin: Vec }
  | { kind: "scale"; factor: number; origin: Vec }

export interface Presentation {
  hidden: boolean
  opacity: number
  transforms: TransformOp[]
  spin: { secondsPerTurn: number; dir: 1 | -1; origin: Vec } | null
  travel: { dx: number; dy: number; seconds: number } | null
  blink: { seconds: number; style: "fade" | "hide" } | null
  color: { fill: string | null; stroke: string | null } | null
  level: {
    pct: number
    direction: "up" | "down" | "left" | "right"
    color: string
  } | null
  flow: { seconds: number; reverse: boolean } | null
  /** Values for the shape's own states (a symbol's "on", "level", …), by key. */
  state: Record<string, boolean | number>
  /** Status string of the shape's first bound point (its own behaviors only). */
  status: string | null
  transitionMs: number
}

export function emptyPresentation(): Presentation {
  return {
    hidden: false,
    opacity: 1,
    transforms: [],
    spin: null,
    travel: null,
    blink: null,
    color: null,
    level: null,
    flow: null,
    state: {},
    status: null,
    transitionMs: 400,
  }
}

export interface ApplyContext {
  frame: OwnerFrame
  /** Reads a bound number parameter. */
  num(name: string, fallback: number): number
  status: InputValue["status"]
}

/** A state the target shape exposes (see studio/editor/shape-states.ts). */
export interface StateOption {
  key: string
  label: string
  kind: "boolean" | "number"
  min?: number
  max?: number
}

export interface DefaultsContext {
  /** States of the shape the behavior is for. */
  states?: StateOption[]
}

export interface EffectDef {
  id: string
  family: Family
  label: string
  description: string
  needsSource: boolean
  /** Shape-level only (not applied to a group's children), e.g. labels and clicks. */
  selfOnly?: boolean
  /** Conflict channel; null means any number may coexist. */
  channel(params: Record<string, ParamValue>): string | null
  output(params: Record<string, ParamValue>): OutputKind
  /** Only offered for shapes that expose states. */
  needsStates?: boolean
  defaults(
    kind: ValueKind | null,
    ctx?: DefaultsContext
  ): {
    mapping: Mapping
    params: Record<string, ParamValue>
  }
  validate(behavior: Behavior): string[]
  apply?(
    p: Presentation,
    out: Output,
    ctx: ApplyContext,
    params: Record<string, ParamValue>
  ): void
}

const str = (v: ParamValue | undefined, fallback: string) =>
  typeof v === "string" ? v : fallback
const bool = (v: ParamValue | undefined, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback
const vec = (v: ParamValue | undefined, fallback: Vec): Vec =>
  v &&
  typeof v === "object" &&
  "x" in v &&
  typeof v.x === "number" &&
  typeof v.y === "number"
    ? { x: v.x, y: v.y }
    : fallback

const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
export const isColor = (value: string) => COLOR.test(value)

const SWITCH_TRUE: Mapping = { kind: "switch", test: "true" }
const range = (
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): Mapping => ({ kind: "range", inMin, inMax, outMin, outMax, clamp: true })

function checkMapping(behavior: Behavior, expected: OutputKind): string[] {
  const { mapping } = behavior
  const errors: string[] = []
  if (expected === "boolean" && mapping.kind !== "switch")
    errors.push("This effect needs an on/off condition.")
  if (expected === "number") {
    if (mapping.kind === "states") {
      const outs = [...mapping.cases.map((c) => c.out), mapping.fallback]
      if (outs.some((out) => !Number.isFinite(Number.parseFloat(out))))
        errors.push("Give every value a number.")
    } else if (mapping.kind !== "range")
      errors.push("This effect needs a number range or a table of values.")
  }
  if (
    expected === "text" &&
    mapping.kind !== "states" &&
    mapping.kind !== "value"
  )
    errors.push("This effect needs a value or a list of states.")
  if (mapping.kind === "range" && mapping.inMin === mapping.inMax)
    errors.push("The input range needs two different numbers.")
  if (
    mapping.kind === "switch" &&
    (mapping.test === "above" ||
      mapping.test === "below" ||
      mapping.test === "equals" ||
      mapping.test === "notEquals")
  ) {
    if (mapping.value === undefined || mapping.value === "")
      errors.push("Enter the value to compare with.")
  }
  return errors
}

function baseValidate(def: Pick<EffectDef, "needsSource" | "output">) {
  return (behavior: Behavior) => {
    const errors: string[] = []
    if (def.needsSource && !behavior.source) errors.push("Choose a point.")
    errors.push(...checkMapping(behavior, def.output(behavior.params)))
    return errors
  }
}

const pivotOf = (params: Record<string, ParamValue>, frame: OwnerFrame) => {
  const p = vec(params.pivot, { x: 0.5, y: 0.5 })
  return frame.point({ x: p.x * frame.w, y: p.y * frame.h })
}

/** Params for driving one state: which one, its kind, and its label for summaries. */
function stateParams(
  state: StateOption | undefined
): Record<string, ParamValue> {
  return state
    ? { state: state.key, stateKind: state.kind, stateLabel: state.label }
    : { state: "", stateKind: "boolean", stateLabel: "" }
}

function stateMapping(state: StateOption | undefined): Mapping {
  if (state?.kind !== "number") return SWITCH_TRUE
  const min = state.min ?? 0
  const max = state.max ?? 100
  return range(min, max, min, max)
}

const effects: EffectDef[] = [
  {
    id: "state",
    family: "display",
    label: "Symbol state",
    description:
      "Drives a symbol's built-in look: running, flow, damper position, level.",
    needsSource: true,
    selfOnly: true,
    needsStates: true,
    channel: (params) => `state:${str(params.state, "")}`,
    output: (params) =>
      str(params.stateKind, "boolean") === "number" ? "number" : "boolean",
    defaults(kind, ctx) {
      const states = ctx?.states ?? []
      const wanted = kind === "number" ? "number" : "boolean"
      const state = states.find((s) => s.kind === wanted) ?? states[0]
      return { mapping: stateMapping(state), params: stateParams(state) }
    },
    validate(behavior) {
      const errors = str(behavior.params.state, "")
        ? []
        : ["Choose which state to drive."]
      return [
        ...errors,
        ...baseValidate({
          needsSource: true,
          output: (p) =>
            str(p.stateKind, "boolean") === "number" ? "number" : "boolean",
        })(behavior),
      ]
    },
    apply(p, out, _ctx, params) {
      const key = str(params.state, "")
      if (!key) return
      if (out.kind === "boolean" || out.kind === "number")
        p.state = { ...p.state, [key]: out.value }
    },
  },
  {
    id: "label",
    family: "display",
    label: "Value label",
    description: "Shows the point's value next to the shape.",
    needsSource: true,
    selfOnly: true,
    channel: () => null,
    output: () => "text",
    defaults: () => ({
      mapping: { kind: "value" },
      params: {
        placement: "bottom",
        caption: "",
        colorMode: "status",
        color: "#0c0a09",
        background: true,
        size: "m",
      },
    }),
    validate: baseValidate({ needsSource: true, output: () => "text" }),
  },
  {
    id: "color",
    family: "display",
    label: "Color",
    description: "Colors the shape from the value: on/off, states or status.",
    needsSource: true,
    channel: () => "color",
    output: () => "text",
    defaults: (kind) => ({
      mapping:
        kind === "boolean"
          ? {
              kind: "states",
              cases: [
                { match: "true", out: "#5ea500" },
                { match: "false", out: "#a6a09b" },
              ],
              fallback: "#a6a09b",
            }
          : { kind: "states", cases: [], fallback: "#0092b8" },
      params: { target: "both", statusOverride: true },
    }),
    validate(behavior) {
      const errors = baseValidate({ needsSource: true, output: () => "text" })(
        behavior
      )
      if (behavior.mapping.kind === "states") {
        const bad = [
          ...behavior.mapping.cases.map((c) => c.out),
          behavior.mapping.fallback,
        ].some((c) => !isColor(c))
        if (bad) errors.push("Use colors like #5ea500.")
      }
      return errors
    },
    apply(p, out, ctx, params) {
      if (out.kind !== "text") return
      let color = out.value
      if (bool(params.statusOverride, true)) {
        const status = (ctx.status ?? "").toLowerCase()
        if (status.includes("alarm")) color = "#e7000b"
        else if (status.includes("fault") || status.includes("down"))
          color = "#ea580c"
      }
      const target = str(params.target, "both")
      p.color = {
        fill: target !== "stroke" ? color : null,
        stroke: target !== "fill" ? color : null,
      }
    },
  },
  {
    id: "level",
    family: "display",
    label: "Level fill",
    description: "Fills the shape from one side by a percentage.",
    needsSource: true,
    channel: () => "level",
    output: () => "number",
    defaults: () => ({
      mapping: range(0, 100, 0, 100),
      params: { direction: "up", color: "#0092b8" },
    }),
    validate(behavior) {
      const errors = baseValidate({
        needsSource: true,
        output: () => "number",
      })(behavior)
      if (!isColor(str(behavior.params.color, "#0092b8")))
        errors.push("Use a color like #0092b8.")
      return errors
    },
    apply(p, out, _ctx, params) {
      if (out.kind !== "number") return
      const direction = str(params.direction, "up") as
        "up" | "down" | "left" | "right"
      p.level = {
        pct: Math.max(0, Math.min(100, out.value)),
        direction,
        color: str(params.color, "#0092b8"),
      }
    },
  },
  {
    id: "visibility",
    family: "appearance",
    label: "Visibility",
    description: "Shows the shape only while the condition holds.",
    needsSource: true,
    channel: () => "visibility",
    output: () => "boolean",
    defaults: () => ({ mapping: SWITCH_TRUE, params: {} }),
    validate: baseValidate({ needsSource: true, output: () => "boolean" }),
    apply(p, out) {
      if (out.kind === "boolean" && !out.value) p.hidden = true
    },
  },
  {
    id: "opacity",
    family: "appearance",
    label: "Opacity",
    description: "Fades the shape with the value.",
    needsSource: true,
    channel: () => "opacity",
    output: () => "number",
    defaults: () => ({ mapping: range(0, 100, 20, 100), params: {} }),
    validate: baseValidate({ needsSource: true, output: () => "number" }),
    apply(p, out) {
      if (out.kind === "number")
        p.opacity *= Math.max(0, Math.min(100, out.value)) / 100
    },
  },
  {
    id: "blink",
    family: "appearance",
    label: "Blink",
    description: "Flashes the shape while the condition holds, e.g. in alarm.",
    needsSource: true,
    channel: () => "blink",
    output: () => "boolean",
    defaults: () => ({
      mapping: SWITCH_TRUE,
      params: { seconds: 1, style: "fade" },
    }),
    validate: baseValidate({ needsSource: true, output: () => "boolean" }),
    apply(p, out, ctx, params) {
      if (out.kind === "boolean" && out.value) {
        p.blink = {
          seconds: Math.max(0.2, ctx.num("seconds", 1)),
          style: str(params.style, "fade") === "hide" ? "hide" : "fade",
        }
      }
    },
  },
  {
    id: "rotate",
    family: "motion",
    label: "Rotate",
    description: "Turns to follow a value, or spins while the condition holds.",
    needsSource: true,
    channel: () => "rotation",
    output: (params) =>
      str(params.mode, "follow") === "spin" ? "boolean" : "number",
    defaults: (kind) =>
      kind === "boolean"
        ? {
            mapping: SWITCH_TRUE,
            params: {
              mode: "spin",
              secondsPerTurn: 1.5,
              direction: "cw",
              pivot: { x: 0.5, y: 0.5 },
            },
          }
        : {
            mapping: range(0, 100, 0, 360),
            params: {
              mode: "follow",
              secondsPerTurn: 1.5,
              direction: "cw",
              pivot: { x: 0.5, y: 0.5 },
            },
          },
    validate: (behavior) =>
      baseValidate({
        needsSource: true,
        output: (p) =>
          str(p.mode, "follow") === "spin" ? "boolean" : "number",
      })(behavior),
    apply(p, out, ctx, params) {
      const origin = pivotOf(params, ctx.frame)
      const dir = str(params.direction, "cw") === "ccw" ? -1 : 1
      if (str(params.mode, "follow") === "spin") {
        if (out.kind === "boolean" && out.value) {
          const seconds = ctx.num("secondsPerTurn", 1.5)
          if (seconds > 0)
            p.spin = { secondsPerTurn: Math.max(0.1, seconds), dir, origin }
        }
      } else if (out.kind === "number") {
        p.transforms.push({ kind: "rotate", deg: out.value * dir, origin })
      }
    },
  },
  {
    id: "move",
    family: "motion",
    label: "Move",
    description:
      "Slides with a value, or travels back and forth while the condition holds.",
    needsSource: true,
    channel: (params) => `move-${str(params.axis, "x")}`,
    output: (params) =>
      str(params.mode, "follow") === "travel" ? "boolean" : "number",
    defaults: (kind) =>
      kind === "boolean"
        ? {
            mapping: SWITCH_TRUE,
            params: { mode: "travel", axis: "x", distance: 40, seconds: 2 },
          }
        : {
            mapping: range(0, 100, 0, 100),
            params: { mode: "follow", axis: "x", distance: 40, seconds: 2 },
          },
    validate: (behavior) =>
      baseValidate({
        needsSource: true,
        output: (p) =>
          str(p.mode, "follow") === "travel" ? "boolean" : "number",
      })(behavior),
    apply(p, out, ctx, params) {
      const axis = str(params.axis, "x")
      const unit = axis === "y" ? { x: 0, y: 1 } : { x: 1, y: 0 }
      if (str(params.mode, "follow") === "travel") {
        if (out.kind === "boolean" && out.value) {
          const distance = ctx.num("distance", 40)
          const d = ctx.frame.vector({
            x: unit.x * distance,
            y: unit.y * distance,
          })
          p.travel = {
            dx: d.x,
            dy: d.y,
            seconds: Math.max(0.2, ctx.num("seconds", 2)),
          }
        }
      } else if (out.kind === "number") {
        const d = ctx.frame.vector({
          x: unit.x * out.value,
          y: unit.y * out.value,
        })
        p.transforms.push({ kind: "translate", x: d.x, y: d.y })
      }
    },
  },
  {
    id: "scale",
    family: "motion",
    label: "Scale",
    description: "Grows or shrinks with a value (100 = actual size).",
    needsSource: true,
    channel: () => "scale",
    output: () => "number",
    defaults: () => ({ mapping: range(0, 100, 50, 150), params: {} }),
    validate: baseValidate({ needsSource: true, output: () => "number" }),
    apply(p, out, ctx) {
      if (out.kind !== "number") return
      const origin = ctx.frame.point({ x: ctx.frame.w / 2, y: ctx.frame.h / 2 })
      p.transforms.push({
        kind: "scale",
        factor: Math.max(0.05, Math.min(4, out.value / 100)),
        origin,
      })
    },
  },
  {
    id: "flow",
    family: "motion",
    label: "Pipe flow",
    description:
      "Animates dashes along lines and outlines while the condition holds.",
    needsSource: true,
    channel: () => "flow",
    output: () => "boolean",
    defaults: () => ({
      mapping: SWITCH_TRUE,
      params: { seconds: 1, reverse: false },
    }),
    validate: baseValidate({ needsSource: true, output: () => "boolean" }),
    apply(p, out, ctx, params) {
      if (out.kind === "boolean" && out.value)
        p.flow = {
          seconds: Math.max(0.1, ctx.num("seconds", 1)),
          reverse: bool(params.reverse, false),
        }
    },
  },
  {
    id: "navigate",
    family: "interaction",
    label: "On click: go to",
    description:
      "Clicking the shape in Present mode goes to a page or another shape.",
    needsSource: false,
    selfOnly: true,
    channel: () => "click",
    output: () => "none",
    defaults: () => ({
      mapping: { kind: "value" },
      params: { target: "", framing: "fit" },
    }),
    validate(behavior) {
      return str(behavior.params.target, "")
        ? []
        : ["Choose where clicking should go."]
    },
  },
]

export const EFFECTS: ReadonlyMap<string, EffectDef> = new Map(
  effects.map((e) => [e.id, e])
)
export const EFFECT_ORDER = effects.map((e) => e.id)

export function getEffect(id: string): EffectDef | undefined {
  return EFFECTS.get(id)
}

/** Enabled behaviors on one shape that would fight over a channel, other than `candidate`. */
export function findConflict(
  behaviors: Behavior[],
  candidate: Behavior
): Behavior | null {
  if (!candidate.enabled) return null
  const def = getEffect(candidate.effect)
  const channel = def?.channel(candidate.params)
  if (!channel) return null
  return (
    behaviors.find(
      (other) =>
        other.id !== candidate.id &&
        other.enabled &&
        getEffect(other.effect)?.channel(other.params) === channel
    ) ?? null
  )
}

/** An on/off test that suits the point: numbers compare with a threshold you can see and edit. */
export function switchFor(kind: ValueKind | null): SwitchMapping {
  return kind === "number"
    ? { kind: "switch", test: "above", value: 0 }
    : { kind: "switch", test: "true" }
}

/**
 * A number mapping that suits the point: numbers scale through the range; on/off points
 * pick from a table (On → the top of the range, Off → the bottom); multistate points get
 * a table to fill in.
 */
export function numberMappingFor(
  kind: ValueKind | null,
  range: RangeMapping
): Mapping {
  if (kind === "boolean")
    return {
      kind: "states",
      cases: [
        { match: "true", out: String(range.outMax) },
        { match: "false", out: String(range.outMin) },
      ],
      fallback: String(range.outMin),
    }
  if (kind === "text")
    return { kind: "states", cases: [], fallback: String(range.outMin) }
  return range
}

/** Fits an effect's default mapping to the kind of point driving it. */
export function adaptMapping(
  mapping: Mapping,
  output: OutputKind,
  kind: ValueKind | null
): Mapping {
  if (
    output === "boolean" &&
    mapping.kind === "switch" &&
    mapping.test === "true"
  )
    return switchFor(kind)
  if (output === "number" && mapping.kind === "range")
    return numberMappingFor(kind, mapping)
  return mapping
}

/** An effect's defaults for a point of `kind`, with the mapping fitted to that point. */
export function defaultsFor(
  def: EffectDef,
  kind: ValueKind | null,
  ctx?: DefaultsContext
): { mapping: Mapping; params: Record<string, ParamValue> } {
  const { mapping, params } = def.defaults(kind, ctx)
  return { mapping: adaptMapping(mapping, def.output(params), kind), params }
}

/** Mapping and params for driving `state` (used when the person picks a different state). */
export function stateDefaults(
  state: StateOption,
  kind: ValueKind | null = null
): {
  mapping: Mapping
  params: Record<string, ParamValue>
} {
  const output = state.kind === "number" ? "number" : "boolean"
  return {
    mapping: adaptMapping(stateMapping(state), output, kind),
    params: stateParams(state),
  }
}

export type { BoundNumber }
export { resolveNumber }
