import assert from "node:assert/strict"
import { test } from "node:test"

import {
  checkNames,
  dependentsOf,
  EMPTY_PREFERENCES,
  resolveEnabled,
  setPluginEnabled,
  sdkCompatible,
  SDK_VERSION,
  validatePlugins,
  type PluginNode,
} from "./registry.ts"

const graph: PluginNode[] = [
  { id: "canvas-core", version: "1.0.0", required: true },
  { id: "pen-shapes", version: "1.0.0" },
  { id: "media-import", version: "1.0.0" },
  {
    id: "vector-pdf",
    version: "0.2.0",
    dependencies: ["media-import"],
    defaultEnabled: false,
  },
  { id: "behaviors", version: "1.0.0" },
  { id: "niagara", version: "1.0.0", optionalDependencies: ["behaviors"] },
  { id: "charts", version: "1.0.0", optionalDependencies: ["niagara"] },
  { id: "assistant", version: "1.0.0", optionalDependencies: ["niagara"] },
  { id: "future", version: "0.0.1", stage: "planned" },
]

test("a valid graph has no errors", () => {
  assert.deepEqual(validatePlugins(graph), [])
})

test("validation catches bad ids, unknown deps, duplicates and cycles", () => {
  const errors = validatePlugins([
    { id: "Bad_Id", version: "1" },
    { id: "a", version: "1.0.0", dependencies: ["b"] },
    { id: "b", version: "1.0.0", dependencies: ["a"] },
    {
      id: "c",
      version: "1.0.0",
      dependencies: ["missing"],
      optionalDependencies: ["missing"],
    },
    { id: "a", version: "1.0.0" },
  ])
  assert.ok(errors.some((e) => e.includes("kebab-case")))
  assert.ok(errors.some((e) => e.includes("semver")))
  assert.ok(errors.some((e) => e.includes("duplicate")))
  assert.ok(errors.some((e) => e.includes("cycle")))
  assert.ok(errors.some((e) => e.includes('unknown dependency "missing"')))
  assert.ok(errors.some((e) => e.includes("both required and optional")))
})

test("defaults: required and default-on plugins, never planned ones", () => {
  const enabled = resolveEnabled(graph, EMPTY_PREFERENCES)
  assert.ok(enabled.has("canvas-core"))
  assert.ok(enabled.has("pen-shapes"))
  assert.ok(!enabled.has("vector-pdf"))
  assert.ok(!enabled.has("future"))
})

test("enabling a plugin enables its dependencies", () => {
  const off = setPluginEnabled(graph, EMPTY_PREFERENCES, "media-import", false)
  assert.ok(!resolveEnabled(graph, off).has("media-import"))
  const on = setPluginEnabled(graph, off, "vector-pdf", true)
  const enabled = resolveEnabled(graph, on)
  assert.ok(enabled.has("vector-pdf"))
  assert.ok(enabled.has("media-import"))
})

test("disabling a plugin disables exactly its dependents", () => {
  const prefs = setPluginEnabled(graph, EMPTY_PREFERENCES, "vector-pdf", true)
  const next = setPluginEnabled(graph, prefs, "media-import", false)
  const enabled = resolveEnabled(graph, next)
  assert.ok(!enabled.has("media-import"))
  assert.ok(!enabled.has("vector-pdf"))
  assert.ok(enabled.has("behaviors"), "unrelated plugins stay on")
  assert.deepEqual(dependentsOf(graph, "media-import"), ["vector-pdf"])
})

test("required and planned plugins ignore toggles", () => {
  assert.equal(
    setPluginEnabled(graph, EMPTY_PREFERENCES, "canvas-core", false),
    EMPTY_PREFERENCES
  )
  assert.equal(
    setPluginEnabled(graph, EMPTY_PREFERENCES, "future", true),
    EMPTY_PREFERENCES
  )
})

test("every combination of choices resolves to a dependency-safe set", () => {
  const togglable = graph.filter((p) => !p.required && p.stage !== "planned")
  for (let mask = 0; mask < 1 << togglable.length; mask++) {
    const prefs = {
      enabled: togglable.filter((_, i) => mask & (1 << i)).map((p) => p.id),
      disabled: togglable.filter((_, i) => !(mask & (1 << i))).map((p) => p.id),
    }
    const enabled = resolveEnabled(graph, prefs)
    assert.ok(enabled.has("canvas-core"))
    for (const id of enabled) {
      const plugin = graph.find((p) => p.id === id)!
      for (const dep of plugin.dependencies ?? []) {
        assert.ok(enabled.has(dep), `mask ${mask}: ${id} is on without ${dep}`)
      }
    }
  }
})

test("plugins load on the SDK major they were written for, if it's new enough", () => {
  assert.equal(sdkCompatible("1.0.0", "1.0.0"), true)
  assert.equal(sdkCompatible("1.0.0", "1.4.2"), true)
  assert.equal(sdkCompatible("1.2.0", "1.1.9"), false)
  assert.equal(sdkCompatible("1.1.3", "1.1.2"), false)
  assert.equal(sdkCompatible("1.0.0", "2.0.0"), false)
  const [major] = SDK_VERSION.split(".")
  assert.deepEqual(
    validatePlugins([
      { id: "ok", version: "1.0.0", requiresSdk: `${major}.0.0` },
      {
        id: "future",
        version: "1.0.0",
        requiresSdk: `${Number(major) + 1}.0.0`,
      },
      { id: "bad", version: "1.0.0", requiresSdk: "one" },
    ]),
    [
      `future: needs plugin SDK ${Number(major) + 1}.0.0; this Lemscape has ${SDK_VERSION}`,
      "bad: requiresSdk must be semver",
    ]
  )
})

test("shape, binding and tool names and contribution ids can't clash", () => {
  const names = (
    id: string,
    shapes: string[],
    contributions: Record<string, string[]> = {},
    required = false
  ) => ({
    id,
    required,
    engine: { shapes, bindings: [], tools: [] },
    contributions,
  })
  assert.deepEqual(
    checkNames([
      names("canvas-core", ["geo", "arrow"], {}, true),
      names("gauges", ["gauges-dial", "gauges-bar"], { panels: ["gauges"] }),
      names("charts", ["bas-chart"], { panels: ["charts"] }),
    ]),
    { errors: [], warnings: [] }
  )

  const { errors, warnings } = checkNames([
    names("canvas-core", ["geo"], {}, true),
    names("gauges", ["geo", "dial"], { panels: ["points", "points"] }),
    names("meters", ["dial"], { panels: ["points"] }),
  ])
  assert.deepEqual(errors, [
    'gauges: shape type "geo" is already defined by canvas-core',
    'gauges: two of its panels have the id "points"',
    'meters: shape type "dial" is already defined by gauges',
    'meters: panels id "points" is already used by gauges',
  ])
  assert.deepEqual(warnings, [
    'gauges: shape type "geo" should start with "gauges-" so it can\'t clash with another plugin\'s',
    'gauges: shape type "dial" should start with "gauges-" so it can\'t clash with another plugin\'s',
    'meters: shape type "dial" should start with "meters-" so it can\'t clash with another plugin\'s',
  ])
})
