"use client"

import type { Editor, TLShape, TLShapeId } from "tldraw"

import {
  getShapeStates,
  kindOf,
  pointIdSchema,
  resolvePoints,
  safeBatch,
  sourceSchema,
  type AiBoardTool,
  type AiContribution,
  type JsonSchema,
} from "@/sdk"

import {
  defaultsFor,
  EFFECT_ORDER,
  EFFECTS,
  findConflict,
  getEffect,
  stateDefaults,
  type StateOption,
  type ValueKind,
} from "./core/effects"
import {
  DEFAULT_TRANSITION,
  newBehaviorId,
  parseBehavior,
  parseMapping,
  type Behavior,
  type Condition,
  type Mapping,
  type ParamValue,
  type SwitchTest,
} from "./core/model"
import { savedBehaviors, writeBehaviors } from "./runtime/shapes"

// Behaviors for AI apps: what makes a graphic live (a fan spins while it runs, a
// valve fills with its position, a label shows the value). One behavior = one effect
// driven by one point, with an optional mapping and conditions.

const MAPPING_GUIDE = {
  switch:
    "{kind:'switch', test:'true'|'false'|'equals'|'notEquals'|'above'|'below', value?} for on/off effects",
  range:
    "{kind:'range', inMin, inMax, outMin, outMax, clamp} to scale a number into the effect's range",
  states:
    "{kind:'states', cases:[{match, out}], fallback} to pick an output per value (colors are hex like #5ea500)",
  value: "{kind:'value'} passes the value through (labels)",
}

const conditionSchema: JsonSchema = {
  type: "object",
  required: ["point", "test"],
  additionalProperties: false,
  properties: {
    point: pointIdSchema,
    test: {
      type: "string",
      enum: ["true", "false", "equals", "notEquals", "above", "below"],
    },
    value: { type: ["string", "number"] },
  },
}

const behaviorFields = {
  point: pointIdSchema,
  source: sourceSchema,
  mapping: {
    type: "object",
    description:
      "Leave out for the effect's default. See list_behavior_effects.",
  },
  params: {
    type: "object",
    description: "Effect parameters; merged over the defaults.",
  },
  conditions: { type: "array", maxItems: 6, items: conditionSchema },
  name: { type: "string", maxLength: 80 },
  enabled: { type: "boolean" },
} satisfies Record<string, JsonSchema>

interface BehaviorInput {
  point?: string
  source?: string
  mapping?: Record<string, unknown>
  params?: Record<string, unknown>
  conditions?: { point: string; test: SwitchTest; value?: string | number }[]
  name?: string
  enabled?: boolean
}

function shapeFor(editor: Editor, id: string): TLShape {
  const shape = editor.getShape(id as TLShapeId)
  if (!shape) throw new Error(`No shape ${id}.`)
  if (shape.isLocked) throw new Error(`${id} is locked by the person.`)
  const pageId = editor.getAncestorPageId(shape)
  const page = pageId ? editor.getPage(pageId) : null
  if (page && kindOf(page) !== "ui")
    throw new Error("Behaviors work on UI pages only.")
  return shape
}

const statesOf = (editor: Editor, shape: TLShape): StateOption[] =>
  getShapeStates(editor, shape).map(({ key, label, kind, min, max }) => ({
    key,
    label,
    kind,
    min,
    max,
  }))

function cleanParams(value: Record<string, unknown> | undefined) {
  const out: Record<string, ParamValue> = {}
  for (const [key, raw] of Object.entries(value ?? {}))
    out[key] = raw as ParamValue
  return out
}

/** Checks a behavior the way the Behavior tab does; throws with what's wrong. */
function checked(behavior: Behavior, others: Behavior[]): Behavior {
  const parsed = parseBehavior(JSON.parse(JSON.stringify(behavior)))
  if (!parsed)
    throw new Error(
      `That behavior isn't valid. Mappings: ${Object.values(MAPPING_GUIDE).join("; ")}.`
    )
  const problems = getEffect(parsed.effect)?.validate(parsed) ?? []
  if (problems.length) throw new Error(problems.join(" "))
  const conflict = findConflict(others, parsed)
  if (conflict)
    throw new Error(
      `It would fight with behavior ${conflict.id} (${getEffect(conflict.effect)?.label}) on this shape. Disable or remove that one first.`
    )
  return parsed
}

async function conditionsFor(
  input: BehaviorInput["conditions"],
  source: string | undefined
): Promise<Condition[]> {
  if (!input?.length) return []
  const refs = await resolvePoints(
    input.map((c) => c.point),
    source
  )
  return input.map((c, i) => ({
    ref: { source: refs[i].source, point: refs[i].point, label: refs[i].label },
    mapping: {
      kind: "switch",
      test: c.test,
      ...(c.value !== undefined ? { value: c.value } : {}),
    },
  }))
}

const listEffects: AiBoardTool = {
  name: "list_behavior_effects",
  title: "See behavior effects",
  access: "read",
  description:
    "What behaviors can do to a shape (label, color, level fill, visibility, blink, rotate, move, scale, pipe flow, symbol state, click to go to), each with its default mapping and parameters for a numeric and an on/off point, and how mappings work.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run() {
    return {
      data: {
        mappings: MAPPING_GUIDE,
        conditions:
          "Extra gates: [{point, test, value?}]; the behavior runs only while all hold.",
        effects: EFFECT_ORDER.map((id) => {
          const def = EFFECTS.get(id)!
          return {
            id,
            label: def.label,
            family: def.family,
            description: def.description,
            needsPoint: def.needsSource,
            ...(def.needsStates
              ? {
                  note: "Only for library symbols with states (read_page shows them as `states`); set params.state to one of their keys.",
                }
              : {
                  forNumber: defaultsFor(def, "number"),
                  forOnOff: defaultsFor(def, "boolean"),
                }),
            ...(id === "navigate"
              ? {
                  note: "params.target is a page id (page:…) or shape id (shape:…).",
                }
              : {}),
          }
        }),
      },
    }
  },
}

const getBehaviors: AiBoardTool<{ shapeIds: string[] }> = {
  name: "get_behaviors",
  title: "Read behaviors",
  access: "read",
  description:
    "The behaviors on shapes, with any problems the Behavior tab would show.",
  inputSchema: {
    type: "object",
    required: ["shapeIds"],
    additionalProperties: false,
    properties: {
      shapeIds: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string" },
      },
    },
  },
  run({ editor }, input) {
    return {
      data: input.shapeIds.map((id) => {
        const shape = editor.getShape(id as TLShapeId)
        if (!shape) return { id, error: "not found" }
        const { behaviors } = savedBehaviors(shape)
        return {
          id,
          states: statesOf(editor, shape).map((s) => s.key),
          behaviors: behaviors.map((b) => ({
            ...b,
            problems: getEffect(b.effect)?.validate(b) ?? ["Unknown effect"],
          })),
        }
      }),
    }
  },
}

const addBehavior: AiBoardTool<
  BehaviorInput & { shapeId: string; effect: string }
> = {
  name: "add_behavior",
  title: "Add a behavior",
  access: "edit",
  timeoutMs: 30_000,
  description:
    "Makes a shape on a UI page react to a point: picks the effect's sensible defaults for that point (call list_behavior_effects first), then applies your mapping/params. Example: fan symbol + supply fan status → effect 'state' or 'rotate'; valve + position → 'level'; any shape + a value → 'label'.",
  inputSchema: {
    type: "object",
    required: ["shapeId", "effect"],
    additionalProperties: false,
    properties: {
      shapeId: { type: "string" },
      effect: { type: "string", enum: EFFECT_ORDER },
      ...behaviorFields,
    },
  },
  async run({ editor }, input) {
    const shape = shapeFor(editor, input.shapeId)
    const def = getEffect(input.effect)!
    let source: Behavior["source"] = null
    let kind: ValueKind | null = null
    if (input.point) {
      const [ref] = await resolvePoints([input.point], input.source)
      source = { source: ref.source, point: ref.point, label: ref.label }
      kind = ref.kind
    } else if (def.needsSource) {
      throw new Error(`${def.label} needs a point.`)
    }
    const states = statesOf(editor, shape)
    if (def.needsStates && !states.length)
      throw new Error("That shape has no states to drive. Use another effect.")
    const wantedState =
      typeof input.params?.state === "string"
        ? states.find((s) => s.key === input.params?.state)
        : undefined
    if (def.needsStates && input.params?.state !== undefined && !wantedState)
      throw new Error(
        `No state ${String(input.params.state)}. It has: ${states.map((s) => s.key).join(", ")}.`
      )
    const defaults = wantedState
      ? stateDefaults(wantedState, kind)
      : defaultsFor(def, kind, { states })
    const mapping: Mapping | null = input.mapping
      ? parseMapping(input.mapping)
      : defaults.mapping
    if (!mapping)
      throw new Error(
        `That mapping isn't valid. ${Object.values(MAPPING_GUIDE).join("; ")}.`
      )
    const existing = savedBehaviors(editor.getShape(shape.id)).behaviors
    const behavior = checked(
      {
        id: newBehaviorId(),
        v: 1,
        effect: def.id,
        ...(input.name ? { name: input.name } : {}),
        enabled: input.enabled ?? true,
        source,
        mapping,
        conditions: await conditionsFor(input.conditions, input.source),
        params: { ...defaults.params, ...cleanParams(input.params) },
        transition: DEFAULT_TRANSITION,
      },
      existing
    )
    safeBatch(editor, () =>
      writeBehaviors(
        editor,
        shape.id,
        [...existing, behavior],
        "AI: add behavior"
      )
    )
    return { text: `Added ${def.label}.`, data: { behaviorId: behavior.id } }
  },
}

const updateBehavior: AiBoardTool<
  BehaviorInput & { shapeId: string; behaviorId: string }
> = {
  name: "update_behavior",
  title: "Change a behavior",
  access: "edit",
  timeoutMs: 30_000,
  description:
    "Changes a behavior: its point, mapping, params (merged), conditions (replaced), name or enabled.",
  inputSchema: {
    type: "object",
    required: ["shapeId", "behaviorId"],
    additionalProperties: false,
    properties: {
      shapeId: { type: "string" },
      behaviorId: { type: "string" },
      ...behaviorFields,
    },
  },
  async run({ editor }, input) {
    const shape = shapeFor(editor, input.shapeId)
    const existing = savedBehaviors(shape).behaviors
    const current = existing.find((b) => b.id === input.behaviorId)
    if (!current)
      throw new Error(`No behavior ${input.behaviorId} on that shape.`)
    let source = current.source
    if (input.point) {
      const [ref] = await resolvePoints([input.point], input.source)
      source = { source: ref.source, point: ref.point, label: ref.label }
    }
    const mapping = input.mapping
      ? parseMapping(input.mapping)
      : current.mapping
    if (!mapping)
      throw new Error(
        `That mapping isn't valid. ${Object.values(MAPPING_GUIDE).join("; ")}.`
      )
    const next = checked(
      {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        source,
        mapping,
        params: { ...current.params, ...cleanParams(input.params) },
        conditions:
          input.conditions !== undefined
            ? await conditionsFor(input.conditions, input.source)
            : current.conditions,
      },
      existing
    )
    safeBatch(editor, () =>
      writeBehaviors(
        editor,
        shape.id,
        existing.map((b) => (b.id === next.id ? next : b)),
        "AI: change behavior"
      )
    )
    return { text: "Behavior changed." }
  },
}

const removeBehavior: AiBoardTool<{ shapeId: string; behaviorId: string }> = {
  name: "remove_behavior",
  title: "Remove a behavior",
  access: "edit",
  description: "Removes a behavior from a shape.",
  inputSchema: {
    type: "object",
    required: ["shapeId", "behaviorId"],
    additionalProperties: false,
    properties: { shapeId: { type: "string" }, behaviorId: { type: "string" } },
  },
  run({ editor }, input) {
    const shape = shapeFor(editor, input.shapeId)
    const existing = savedBehaviors(shape).behaviors
    if (!existing.some((b) => b.id === input.behaviorId))
      throw new Error(`No behavior ${input.behaviorId} on that shape.`)
    safeBatch(editor, () =>
      writeBehaviors(
        editor,
        shape.id,
        existing.filter((b) => b.id !== input.behaviorId),
        "AI: remove behavior"
      )
    )
    return { text: "Behavior removed." }
  },
}

export const behaviorsAi: AiContribution = {
  guide:
    "Behaviors make graphics on UI pages live: a shape reacts to a station point (value label, color, level fill, visibility, blink, rotate, move, scale, pipe flow, symbol state) or goes somewhere on click in Present mode. list_behavior_effects, then add_behavior.",
  tools: [
    listEffects,
    getBehaviors,
    addBehavior,
    updateBehavior,
    removeBehavior,
  ],
  shapes: {
    "*": (editor, shape) => {
      const { behaviors } = savedBehaviors(shape)
      const states = getShapeStates(editor, shape)
      if (!behaviors.length && !states.length) return null
      return {
        ...(states.length ? { states: states.map((s) => s.key) } : {}),
        ...(behaviors.length
          ? {
              behaviors: behaviors.map((b) => ({
                id: b.id,
                effect: b.effect,
                point: b.source?.point,
                enabled: b.enabled,
              })),
            }
          : {}),
      }
    },
  },
}
