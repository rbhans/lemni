// What every plugin's AI tools share: tool names, access kinds, and the JSON Schema
// subset tool inputs use (checked before a tool runs). The connection itself lives in
// the AI connection plugin. Pure (no React, no DOM, relative imports only) so the
// server can import it and `node --test` can run it.

/** How much an AI app may do on this board. Set by the person in the AI panel. */
export type AiAccessLevel = "off" | "read" | "edit" | "full"

/** What a tool does: reads, changes the board, or changes something outside it. */
export type AiToolAccess = "read" | "edit" | "write"

export const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/

/** The JSON Schema subset tool inputs use (checked by `validateInput`). */
export interface JsonSchema {
  type?: JsonType | JsonType[]
  description?: string
  enum?: readonly (string | number | boolean | null)[]
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  additionalProperties?: boolean
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  anyOf?: JsonSchema[]
}

type JsonType =
  "string" | "number" | "integer" | "boolean" | "object" | "array" | "null"

const typeOf = (value: unknown): JsonType => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number"
  return typeof value as JsonType
}

const matchesType = (value: unknown, type: JsonType) => {
  const actual = typeOf(value)
  if (type === "number") return actual === "number" || actual === "integer"
  return actual === type
}

/**
 * Checks a tool input against its schema. Returns problems as short sentences the AI
 * can act on (empty when the input is fine).
 */
export function validateInput(
  schema: JsonSchema,
  value: unknown,
  path = "input"
): string[] {
  if (schema.anyOf) {
    const results = schema.anyOf.map((option) =>
      validateInput(option, value, path)
    )
    if (results.some((problems) => !problems.length)) return []
    return [`${path} doesn't match any allowed form.`]
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => matchesType(value, type)))
      return [`${path} must be ${types.join(" or ")}.`]
  }
  if (schema.enum && !schema.enum.includes(value as never))
    return [`${path} must be one of: ${schema.enum.join(", ")}.`]

  const problems: string[] = []
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return [`${path} must be a finite number.`]
    if (schema.minimum !== undefined && value < schema.minimum)
      problems.push(`${path} must be at least ${schema.minimum}.`)
    if (schema.maximum !== undefined && value > schema.maximum)
      problems.push(`${path} must be at most ${schema.maximum}.`)
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      problems.push(`${path} is too short.`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      problems.push(`${path} is too long (max ${schema.maxLength}).`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      problems.push(`${path} needs at least ${schema.minItems} item(s).`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      problems.push(`${path} takes at most ${schema.maxItems} items.`)
    if (schema.items)
      value.forEach((item, i) =>
        problems.push(...validateInput(schema.items!, item, `${path}[${i}]`))
      )
  }
  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? [])
      if (record[key] === undefined)
        problems.push(`${path}.${key} is required.`)
    for (const [key, item] of Object.entries(record)) {
      const child = schema.properties?.[key]
      if (child) {
        if (item !== undefined)
          problems.push(...validateInput(child, item, `${path}.${key}`))
      } else if (schema.additionalProperties === false) {
        problems.push(`${path}.${key} isn't a known field.`)
      }
    }
  }
  return problems.slice(0, 12)
}
