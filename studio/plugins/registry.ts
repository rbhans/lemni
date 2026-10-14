// Pure plugin-graph logic: validation, dependency resolution and
// enable/disable transitions. No React, no DOM and no path aliases, so it can
// be tested directly with `node --test`.

export interface PluginNode {
  id: string
  version: string
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

export function validatePlugins(plugins: readonly PluginNode[]): string[] {
  const errors: string[] = []
  const byId = new Map<string, PluginNode>()

  for (const plugin of plugins) {
    if (!ID_PATTERN.test(plugin.id))
      errors.push(`${plugin.id}: id must be kebab-case`)
    if (!SEMVER_PATTERN.test(plugin.version))
      errors.push(`${plugin.id}: version must be semver`)
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
