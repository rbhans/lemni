import assert from "node:assert/strict"
import { test } from "node:test"

import {
  defaultsFor,
  EFFECT_ORDER,
  findConflict,
  getEffect,
  stateDefaults,
  type OwnerFrame,
} from "./effects.ts"
import {
  evaluateMapping,
  evaluateRange,
  evaluateStates,
  toBoolean,
  toNumber,
  type InputValue,
} from "./evaluate.ts"
import {
  newBehaviorId,
  parseBehavior,
  pointsUsedBy,
  readBehaviors,
  serializeBehaviors,
  type Behavior,
} from "./model.ts"
import { composePresentation, transformToCss } from "./presentation.ts"

const v = (
  value: unknown,
  display = String(value),
  status = "{ok}"
): InputValue => ({ value, display, ok: true, status })
const ref = (point: string) => ({ source: "niagara:http://sim", point })

const SAMPLE_STATES = [
  { key: "on", label: "On", kind: "boolean" as const },
  { key: "level", label: "Level", kind: "number" as const, min: 0, max: 100 },
]

function behavior(
  effect: string,
  kind: "boolean" | "number" | "text" | null,
  patch: Partial<Behavior> = {}
): Behavior {
  const def = getEffect(effect)!
  const { mapping, params } = def.defaults(kind, { states: SAMPLE_STATES })
  return {
    id: newBehaviorId(),
    v: 1,
    effect,
    enabled: true,
    source: ref("slot:/p"),
    mapping,
    conditions: [],
    params,
    transition: { ms: 400, easing: "ease-in-out" },
    ...patch,
  }
}

const selfFrame: OwnerFrame = {
  w: 100,
  h: 50,
  point: (p) => p,
  vector: (p) => p,
  isSelf: true,
}

test("value readings follow BAS conventions", () => {
  assert.equal(toNumber(v("72.4 °F")), 72.4)
  assert.equal(toNumber(v(true)), 1)
  assert.equal(toBoolean(v("Occupied")), true)
  assert.equal(toBoolean(v("off")), false)
  assert.equal(toBoolean(v(0)), false)
  assert.equal(toNumber(v("n/a")), null)
})

test("range mapping interpolates, clamps and survives a zero span", () => {
  const r = {
    kind: "range" as const,
    inMin: 0,
    inMax: 100,
    outMin: 0,
    outMax: 360,
    clamp: true,
  }
  assert.equal(evaluateRange(r, v(50)), 180)
  assert.equal(evaluateRange(r, v(150)), 360)
  assert.equal(evaluateRange({ ...r, clamp: false }, v(150)), 540)
  assert.equal(evaluateRange({ ...r, inMax: 0 }, v(10)), 0)
  // Inverted outputs work (e.g. faster spin at higher speed).
  assert.equal(evaluateRange({ ...r, outMin: 6, outMax: 0.6 }, v(100)), 0.6)
})

test("states match values, display text and boolean points", () => {
  const cases = [
    { match: "true", out: "#5ea500" },
    { match: "occupied", out: "#00f" },
  ]
  assert.equal(evaluateStates(cases, "#999", v(true, "On")), "#5ea500")
  assert.equal(evaluateStates(cases, "#999", v("Occupied")), "#00f")
  assert.equal(evaluateStates(cases, "#999", v("Standby")), "#999")
  assert.equal(
    evaluateMapping({ kind: "value" }, v(58.4, "58.4 °F"))?.value,
    "58.4 °F"
  )
})

test("parsing keeps unknown entries and round-trips known ones", () => {
  const good = behavior("rotate", "boolean")
  const future = { id: "x", v: 2, effect: "teleport" }
  const read = readBehaviors({ behaviors: [good, future, "junk"] })
  assert.equal(read.behaviors.length, 1)
  assert.deepEqual(read.preserved, [future, "junk"])
  const written = serializeBehaviors(read.behaviors, read.preserved)
  assert.deepEqual(parseBehavior(written[0]), good)
  assert.equal(written.length, 3)
})

test("defaults depend on the source kind", () => {
  assert.equal(getEffect("rotate")!.defaults("boolean").params.mode, "spin")
  assert.equal(getEffect("rotate")!.defaults("number").mapping.kind, "range")
  assert.equal(getEffect("move")!.defaults("boolean").params.mode, "travel")
  for (const id of EFFECT_ORDER) {
    const def = getEffect(id)!
    for (const kind of ["boolean", "number", "text", null] as const) {
      const b = behavior(
        id,
        kind,
        def.needsSource
          ? {}
          : {
              source: null,
              params: { ...def.defaults(kind).params, target: "page:x" },
            }
      )
      assert.deepEqual(
        def.validate(b),
        [],
        `${id} defaults for ${kind} should validate`
      )
    }
  }
})

test("one enabled behavior per channel; labels can stack; axes are separate", () => {
  const spin = behavior("rotate", "boolean")
  const follow = behavior("rotate", "number")
  assert.equal(findConflict([spin], follow)?.id, spin.id)
  assert.equal(findConflict([spin], { ...follow, enabled: false }), null)
  assert.equal(
    findConflict([behavior("label", "number")], behavior("label", "number")),
    null
  )
  const moveX = behavior("move", "number")
  const moveY = behavior("move", "number", {
    params: { ...moveX.params, axis: "y" },
  })
  assert.equal(findConflict([moveX], moveY), null)
})

test("presentation: spin while on, color with alarm override, hidden when off", () => {
  const read = (values: Record<string, InputValue>) => (r: { point: string }) =>
    values[r.point]
  const spin = behavior("rotate", "boolean", { source: ref("fan") })
  const color = behavior("color", "boolean", { source: ref("fan") })
  const vis = behavior("visibility", "boolean", { source: ref("occ") })

  const on = composePresentation(
    [{ behaviors: [spin, color, vis], frame: selfFrame }],
    read({ fan: v(true, "On"), occ: v(false, "Off") })
  ).presentation
  assert.deepEqual(on.spin, {
    secondsPerTurn: 1.5,
    dir: 1,
    origin: { x: 50, y: 25 },
  })
  assert.deepEqual(on.color, { fill: "#5ea500", stroke: "#5ea500" })
  assert.equal(on.hidden, true)

  const alarm = composePresentation(
    [{ behaviors: [color], frame: selfFrame }],
    read({ fan: v(true, "On", "{alarm}") })
  ).presentation
  assert.equal(alarm.color?.stroke, "#e7000b")
})

test("presentation: status comes from the shape's first bound point", () => {
  const read = (values: Record<string, InputValue>) => (r: { point: string }) =>
    values[r.point]
  const spin = behavior("rotate", "boolean", { source: ref("fan") })
  const label = behavior("label", "number", { source: ref("vfd") })
  const values = read({
    fan: v(true, "On", "{fault}"),
    vfd: v(40, "40 %", "{ok}"),
  })
  const self = [{ behaviors: [label, spin], frame: selfFrame }]
  assert.equal(composePresentation(self, values).presentation.status, "{ok}")
  assert.equal(
    composePresentation(
      [{ behaviors: [{ ...label, enabled: false }, spin], frame: selfFrame }],
      values
    ).presentation.status,
    "{fault}"
  )
  assert.equal(
    composePresentation([{ behaviors: [], frame: selfFrame }], values)
      .presentation.status,
    null
  )
})

test("presentation: missing values are reported and leave the saved drawing alone", () => {
  const spin = behavior("rotate", "boolean")
  const result = composePresentation(
    [{ behaviors: [spin], frame: selfFrame }],
    () => undefined
  )
  assert.equal(result.presentation.spin, null)
  assert.equal(result.problems[0].message, "No value from the point.")
})

test("presentation: conditions gate behaviors; bound parameters follow points", () => {
  const read = (values: Record<string, InputValue>) => (r: { point: string }) =>
    values[r.point]
  const spin = behavior("rotate", "boolean", {
    source: ref("status"),
    conditions: [
      { ref: ref("cmd"), mapping: { kind: "switch", test: "true" } },
    ],
    params: {
      mode: "spin",
      direction: "ccw",
      pivot: { x: 0, y: 0 },
      secondsPerTurn: {
        bind: ref("vfd"),
        range: {
          kind: "range",
          inMin: 0,
          inMax: 100,
          outMin: 6,
          outMax: 0.6,
          clamp: true,
        },
      },
    },
  })
  const gated = composePresentation(
    [{ behaviors: [spin], frame: selfFrame }],
    read({ status: v(true), cmd: v(false), vfd: v(100) })
  ).presentation
  assert.equal(gated.spin, null)
  const running = composePresentation(
    [{ behaviors: [spin], frame: selfFrame }],
    read({ status: v(true), cmd: v(true), vfd: v(100) })
  ).presentation
  assert.equal(running.spin?.secondsPerTurn, 0.6)
  assert.equal(running.spin?.dir, -1)
})

test("presentation: group and shape transforms compose; nearest owner wins a channel", () => {
  const read = () => v(50)
  const groupFrame: OwnerFrame = {
    w: 200,
    h: 200,
    point: (p) => ({ x: p.x - 50, y: p.y - 50 }),
    vector: (p) => p,
    isSelf: false,
  }
  const shapeRotate = behavior("rotate", "number")
  const groupRotate = behavior("rotate", "number")
  const groupMove = behavior("move", "number")
  const { presentation } = composePresentation(
    [
      { behaviors: [shapeRotate], frame: selfFrame },
      { behaviors: [groupRotate, groupMove], frame: groupFrame },
    ],
    read
  )
  // The group's rotation is shadowed by the shape's; its move still applies, outermost first.
  assert.deepEqual(
    presentation.transforms.map((t) => t.kind),
    ["translate", "rotate"]
  )
  assert.match(
    transformToCss(presentation.transforms),
    /^translate\(50px, 0px\) translate\(50px, 25px\) rotate\(180deg\)/
  )
})

test("pointsUsedBy lists source, conditions and bound parameters", () => {
  const b = behavior("rotate", "boolean", {
    conditions: [
      { ref: ref("cmd"), mapping: { kind: "switch", test: "true" } },
    ],
    params: {
      mode: "spin",
      secondsPerTurn: {
        bind: ref("vfd"),
        range: {
          kind: "range",
          inMin: 0,
          inMax: 100,
          outMin: 6,
          outMax: 1,
          clamp: true,
        },
      },
    },
  })
  assert.deepEqual(
    pointsUsedBy(b).map((r) => r.point),
    ["slot:/p", "cmd", "vfd"]
  )
})

test("symbol state: defaults fit the point, values reach the state, groups don't apply it", () => {
  const states = [
    { key: "on", label: "On", kind: "boolean" as const },
    {
      key: "position",
      label: "Damper open",
      kind: "number" as const,
      min: 0,
      max: 100,
    },
  ]
  const state = getEffect("state")!
  assert.equal(state.needsStates, true)
  assert.equal(EFFECT_ORDER[0], "state")

  const onOff = state.defaults("boolean", { states })
  assert.equal(onOff.params.state, "on")
  assert.equal(onOff.mapping.kind, "switch")
  const percent = state.defaults("number", { states })
  assert.equal(percent.params.state, "position")
  assert.deepEqual(percent.mapping, {
    kind: "range",
    inMin: 0,
    inMax: 100,
    outMin: 0,
    outMax: 100,
    clamp: true,
  })
  assert.deepEqual(
    state.validate({ ...behavior("state", null), params: { state: "" } }),
    ["Choose which state to drive."]
  )

  const fan = {
    ...behavior("state", "boolean"),
    params: onOff.params,
    mapping: onOff.mapping,
    source: ref("sf"),
  }
  const damper = {
    ...behavior("state", "number"),
    params: percent.params,
    mapping: percent.mapping,
    source: ref("oad"),
  }
  // Different states are different channels, so both apply.
  assert.equal(findConflict([fan], damper), null)

  const read = (r: { point: string }) =>
    ({ sf: v(false, "Off"), oad: v(35, "35 %") })[r.point]
  const self = composePresentation(
    [{ behaviors: [fan, damper], frame: selfFrame }],
    read
  ).presentation
  assert.deepEqual(self.state, { on: false, position: 35 })

  const asGroup = composePresentation(
    [{ behaviors: [fan], frame: { ...selfFrame, isSelf: false } }],
    read
  ).presentation
  assert.deepEqual(asGroup.state, {})
})

test("crossed types: numbers drive on/off effects, on/off and multistate points drive numbers", () => {
  // Every effect's fitted defaults validate for every kind of point.
  for (const id of EFFECT_ORDER) {
    const def = getEffect(id)!
    for (const kind of ["boolean", "number", "text", null] as const) {
      const { mapping, params } = defaultsFor(def, kind, {
        states: SAMPLE_STATES,
      })
      const b = behavior(id, kind, {
        mapping,
        params: def.needsSource ? params : { ...params, target: "page:x" },
        ...(def.needsSource ? {} : { source: null }),
      })
      assert.deepEqual(def.validate(b), [], `${id} fitted defaults for ${kind}`)
    }
  }

  // A VFD speed runs an on/off animation through a visible threshold.
  const on = defaultsFor(getEffect("state")!, "number", {
    states: [{ key: "on", label: "On", kind: "boolean" }],
  })
  assert.deepEqual(on.mapping, { kind: "switch", test: "above", value: 0 })
  const fan = behavior("state", null, { ...on, source: ref("vfd") })
  const run = (value: number) =>
    composePresentation([{ behaviors: [fan], frame: selfFrame }], () =>
      v(value, `${value} %`)
    ).presentation.state
  assert.deepEqual(run(0), { on: false })
  assert.deepEqual(run(42), { on: true })

  // An open/closed status drives a damper position through an On/Off table.
  const damperState = {
    key: "position",
    label: "Damper open",
    kind: "number" as const,
    min: 0,
    max: 100,
  }
  const open = stateDefaults(damperState, "boolean")
  assert.deepEqual(open.mapping, {
    kind: "states",
    cases: [
      { match: "true", out: "100" },
      { match: "false", out: "0" },
    ],
    fallback: "0",
  })
  const damper = behavior("state", null, { ...open, source: ref("oad-st") })
  const at = (value: boolean) =>
    composePresentation([{ behaviors: [damper], frame: selfFrame }], () =>
      v(value, value ? "Open" : "Closed")
    ).presentation.state
  assert.deepEqual(at(true), { position: 100 })
  assert.deepEqual(at(false), { position: 0 })

  // A multistate point picks numbers by name; other states fall back.
  const level = behavior("level", "text", {
    mapping: {
      kind: "states",
      cases: [{ match: "Occupied", out: "80" }],
      fallback: "20",
    },
  })
  const fill = (text: string) =>
    composePresentation([{ behaviors: [level], frame: selfFrame }], () =>
      v(text)
    ).presentation.level?.pct
  assert.equal(fill("Occupied"), 80)
  assert.equal(fill("Standby"), 20)

  // Tables for number effects need numbers.
  assert.deepEqual(
    getEffect("level")!.validate({
      ...level,
      mapping: {
        kind: "states",
        cases: [{ match: "Occupied", out: "lots" }],
        fallback: "0",
      },
    }),
    ["Give every value a number."]
  )
})
