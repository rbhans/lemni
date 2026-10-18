// Pure plugin-graph logic: validation, dependency resolution and
// enable/disable transitions. No React, no DOM and no path aliases, so it can
// be tested directly with `node --test`.

/**
 * The plugin SDK's version (semver). A plugin can name the version it was written
 * against in `requiresSdk`; it loads when the major version matches and this one is
 * at least as new. Bump the minor version when the SDK gains things, the major when
 * something plugins rely on changes or goes away.
 */
export const SDK_VERSION = "1.1.0"

export interface PluginNode {
  id: string
  version: string
  /** The oldest SDK version (semver) this plugin works with, e.g. "1.0.0". */
  requiresSdk?: string
  required?: boolean
  defaultEnabled?: boolean
  /** Plugins that are listed but cannot be enabled yet. */
  stage?: "stable" | "preview" | "planned"
  dependencies?: readonly string[]
  optionalDependencies?: readonly string[]
}

/** Only explicit user choices are stored, so new defaults apply without migrations. */
export interface PluginPreferences {
  enabled: string[]
  disabled: string[]
}

export const EMPTY_PREFERENCES: PluginPreferences = {
  enabled: [],
  disabled: [],
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Whether a plugin written against `required` runs on SDK `current`. */
export function sdkCompatible(
  required: string,
  current = SDK_VERSION
): boolean {
  const parse = (v: string) => v.split("-")[0].split(".").map(Number)
  const [rMajor, rMinor, rPatch] = parse(required)
  const [cMajor, cMinor, cPatch] = parse(current)
  if (rMajor !== cMajor) return false
  if (cMinor !== rMinor) return cMinor > rMinor
  return cPatch >= rPatch
}

export function validatePlugins(plugins: readonly PluginNode[]): string[] {
  const errors: string[] = []
  const byId = new Map<string, PluginNode>()

  for (const plugin of plugins) {
    if (!ID_PATTERN.test(plugin.id))
      errors.push(`${plugin.id}: id must be kebab-case`)
    if (!SEMVER_PATTERN.test(plugin.version))
      errors.push(`${plugin.id}: version must be semver`)
    if (plugin.requiresSdk !== undefined) {
      if (!SEMVER_PATTERN.test(plugin.requiresSdk))
        errors.push(`${plugin.id}: requiresSdk must be semver`)
      else if (!sdkCompatible(plugin.requiresSdk))
        errors.push(
          `${plugin.id}: needs plugin SDK ${plugin.requiresSdk}; this Lemscape has ${SDK_VERSION}`
        )
    }
    if (byId.has(plugin.id)) errors.push(`${plugin.id}: duplicate plugin id`)
    else byId.set(plugin.id, plugin)
  }

  for (const plugin of plugins) {
    const required = new Set(plugin.dependencies ?? [])
    for (const dep of plugin.dependencies ?? []) {
      if (!byId.has(dep))
        errors.push(`${plugin.id}: unknown dependency "${dep}"`)
      if (dep === plugin.id) errors.push(`${plugin.id}: depends on itself`)
    }
    for (const dep of plugin.optionalDependencies ?? []) {
      if (!byId.has(dep))
        errors.push(`${plugin.id}: unknown optional dependency "${dep}"`)
      if (required.has(dep))
        errors.push(`${plugin.id}: "${dep}" is both required and optional`)
    }
    if (plugin.required) {
      for (const dep of plugin.dependencies ?? []) {
        if (!byId.get(dep)?.required) {
          errors.push(
            `${plugin.id}: required plugin depends on non-required "${dep}"`
          )
        }
      }
    }
    if (plugin.required && plugin.stage === "planned") {
      errors.push(`${plugin.id}: a required plugin cannot be planned`)
    }
  }

  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string, trail: string[]) => {
    if (done.has(id)) return
    if (visiting.has(id)) {
      errors.push(`dependency cycle: ${[...trail, id].join(" -> ")}`)
      return
    }
    visiting.add(id)
    for (const dep of byId.get(id)?.dependencies ?? [])
      visit(dep, [...trail, id])
    visiting.delete(id)
    done.add(id)
  }
  for (const plugin of plugins) visit(plugin.id, [])

  return errors
}

/** The names a plugin brings that have to be unique across plugins. */
export interface PluginNames {
  id: string
  required?: boolean
  /** Shape and binding types (saved in board files) and tool ids (bound to keys). */
  engine: {
    shapes: readonly string[]
    bindings: readonly string[]
    tools: readonly string[]
  }
  /** Contribution list (panels, commands, …) → the ids of its items. */
  contributions: Readonly<Record<string, readonly string[]>>
}

/** Engine names from before the convention; they keep their names so boards still load. */
const LEGACY_ENGINE_PREFIXES = ["bas-"]

const ENGINE_KINDS = [
  ["shapes", "shape type"],
  ["bindings", "binding type"],
  ["tools", "tool id"],
] as const

/**
 * Clashing names are errors: a second shape util for a type silently replaces the
 * first, and two panels with one id can't both open. Engine names that don't start
 * with the plugin's id are warnings: the prefix is what keeps plugins written apart
 * from clashing (required plugins bring tldraw's own names, so they're exempt).
 */
export function checkNames(plugins: readonly PluginNames[]): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const owners = new Map<string, string>()
  const claim = (
    key: string,
    owner: string,
    clash: (other: string) => string
  ) => {
    const other = owners.get(key)
    if (other === undefined) owners.set(key, owner)
    else errors.push(clash(other))
  }

  for (const plugin of plugins) {
    for (const [kind, label] of ENGINE_KINDS)
      for (const name of new Set(plugin.engine[kind])) {
        claim(`engine:${kind}:${name}`, plugin.id, (other) =>
          other === plugin.id
            ? `${plugin.id}: two ${label}s are "${name}"`
            : `${plugin.id}: ${label} "${name}" is already defined by ${other}`
        )
        const prefixed =
          name === plugin.id ||
          name.startsWith(`${plugin.id}-`) ||
          LEGACY_ENGINE_PREFIXES.some((prefix) => name.startsWith(prefix))
        if (!plugin.required && !prefixed)
          warnings.push(
            `${plugin.id}: ${label} "${name}" should start with "${plugin.id}-" so it can't clash with another plugin's`
          )
      }
    for (const [list, ids] of Object.entries(plugin.contributions))
      for (const id of ids)
        claim(`${list}:${id}`, plugin.id, (other) =>
          other === plugin.id
            ? `${plugin.id}: two of its ${list} have the id "${id}"`
            : `${plugin.id}: ${list} id "${id}" is already used by ${other}`
        )
  }
  return { errors, warnings }
}

function indexById(plugins: readonly PluginNode[]) {
  return new Map(plugins.map((plugin) => [plugin.id, plugin]))
}

/** Every plugin `id` requires, directly or indirectly. */
export function dependenciesOf(
  plugins: readonly PluginNode[],
  id: string
): string[] {
  const byId = indexById(plugins)
  const found = new Set<string>()
  const stack = [...(byId.get(id)?.dependencies ?? [])]
  while (stack.length) {
    const next = stack.pop()!
    if (found.has(next)) continue
    found.add(next)
    stack.push(...(byId.get(next)?.dependencies ?? []))
  }
  return [...found]
}

/** Every plugin that requires `id`, directly or indirectly. */
export function dependentsOf(
  plugins: readonly PluginNode[],
  id: string
): string[] {
  const found = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const plugin of plugins) {
      if (found.has(plugin.id) || plugin.id === id) continue
      if (
        (plugin.dependencies ?? []).some((dep) => dep === id || found.has(dep))
      ) {
        found.add(plugin.id)
        changed = true
      }
    }
  }
  return [...found]
}

export function isSelectable(plugin: PluginNode) {
  return plugin.stage !== "planned"
}

/**
 * Resolves the enabled set: required plugins, defaults and explicit choices,
 * then drops anything whose required dependencies are not all enabled.
 */
export function resolveEnabled(
  plugins: readonly PluginNode[],
  preferences: PluginPreferences = EMPTY_PREFERENCES
): Set<string> {
  const disabled = new Set(preferences.disabled)
  const enabled = new Set<string>()

  for (const plugin of plugins) {
    if (!isSelectable(plugin)) continue
    if (plugin.required) enabled.add(plugin.id)
    else if (preferences.enabled.includes(plugin.id)) enabled.add(plugin.id)
    else if (plugin.defaultEnabled !== false && !disabled.has(plugin.id))
      enabled.add(plugin.id)
  }

  const byId = indexById(plugins)
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...enabled]) {
      const plugin = byId.get(id)
      if (plugin?.required) continue
      if ((plugin?.dependencies ?? []).some((dep) => !enabled.has(dep))) {
        enabled.delete(id)
        changed = true
      }
    }
  }

  return enabled
}

/**
 * Turning a plugin on also turns on what it requires; turning it off also
 * turns off what requires it. Required and planned plugins cannot change.
 */
export function setPluginEnabled(
  plugins: readonly PluginNode[],
  preferences: PluginPreferences,
  id: string,
  on: boolean
): PluginPreferences {
  const plugin = plugins.find((candidate) => candidate.id === id)
  if (!plugin || plugin.required || !isSelectable(plugin)) return preferences

  const enabled = new Set(preferences.enabled)
  const disabled = new Set(preferences.disabled)
  const affected = on
    ? [id, ...dependenciesOf(plugins, id)]
    : [id, ...dependentsOf(plugins, id)]

  for (const target of affected) {
    const targetPlugin = plugins.find((candidate) => candidate.id === target)
    if (!targetPlugin || targetPlugin.required) continue
    if (on) {
      enabled.add(target)
      disabled.delete(target)
    } else {
      disabled.add(target)
      enabled.delete(target)
    }
  }

  return { enabled: [...enabled].sort(), disabled: [...disabled].sort() }
}
