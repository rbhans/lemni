import assert from "node:assert/strict"
import { test } from "node:test"

import { validateInput, type JsonSchema } from "./schema.ts"

const schema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["points"],
  properties: {
    points: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string", minLength: 3 },
    },
    hours: { type: "integer", minimum: 1, maximum: 744 },
    mode: { type: "string", enum: ["set", "override"] },
    at: {
      anyOf: [
        {
          type: "object",
          required: ["x", "y"],
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
        { type: "null" },
      ],
    },
  },
}

test("valid input passes", () => {
  assert.deepEqual(
    validateInput(schema, {
      points: ["slot:/a"],
      hours: 24,
      mode: "set",
      at: { x: 1.5, y: 2 },
    }),
    []
  )
  assert.deepEqual(validateInput(schema, { points: ["abc"], at: null }), [])
})

test("problems read as sentences with paths", () => {
  assert.deepEqual(validateInput(schema, {}), ["input.points is required."])
  assert.deepEqual(validateInput(schema, { points: [] }), [
    "input.points needs at least 1 item(s).",
  ])
  assert.deepEqual(validateInput(schema, { points: ["ab"], hours: 2.5 }), [
    "input.points[0] is too short.",
    "input.hours must be integer.",
  ])
  assert.deepEqual(validateInput(schema, { points: ["abc"], mode: "auto" }), [
    "input.mode must be one of: set, override.",
  ])
  assert.deepEqual(validateInput(schema, { points: ["abc"], extra: 1 }), [
    "input.extra isn't a known field.",
  ])
  assert.deepEqual(validateInput(schema, { points: ["abc"], at: { x: 1 } }), [
    "input.at doesn't match any allowed form.",
  ])
  assert.deepEqual(validateInput(schema, "nope"), ["input must be object."])
})

test("numbers accept integers; integers reject fractions", () => {
  assert.deepEqual(validateInput({ type: "number" }, 3), [])
  assert.deepEqual(validateInput({ type: "integer" }, 3.2), [
    "input must be integer.",
  ])
  assert.deepEqual(validateInput({ type: "number" }, Number.NaN), [
    "input must be a finite number.",
  ])
})
