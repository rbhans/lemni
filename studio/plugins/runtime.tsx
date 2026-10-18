"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { useValue } from "tldraw"

import { TOOL_NAME } from "../ai/schema"
import { studioState } from "../state"
import {
  checkNames,
  resolveEnabled,
  setPluginEnabled,
  validatePlugins,
  type PluginNames,
} from "./registry"
import type {
  AiShapeDescriber,
  AiTool,
  BoardPlugin,
  InspectorSectionContribution,
  InspectorTabContribution,
  LibraryCollectionContribution,
  CommandContribution,
  ConnectionProbeContribution,
  ContextMenuContribution,
  FileImporterContribution,
  MenuItemContribution,
  PageCategoryContribution,
  PanelContribution,
  PasteOptionContribution,
  PointDropContribution,
  CanvasBackgroundContribution,
  SettingsSectionContribution,
  ShapeDecoratorContribution,
  SlotContribution,
  StatusContribution,
  TextImporterContribution,
  ToolbarContribution,
  WorkspaceContribution,
} from "./types"

type Owned<T> = T & { pluginId: string }

export interface Contributions {
  toolbar: Owned<ToolbarContribution>[]
  panels: Owned<PanelContribution>[]
  inspectorTabs: Owned<InspectorTabContribution>[]
  inspectorSections: Owned<InspectorSectionContribution>[]
  menuItems: Owned<MenuItemContribution>[]
  commands: Owned<CommandContribution>[]
  topbarItems: Owned<SlotContribution>[]
  statusItems: Owned<StatusContribution>[]
  workspaces: Owned<WorkspaceContribution>[]
  libraryCollections: Owned<LibraryCollectionContribution>[]
  canvasOverlays: Owned<SlotContribution>[]
  canvasLayers: Owned<SlotContribution>[]
  canvasBackgrounds: Owned<CanvasBackgroundContribution>[]
  settingsSections: Owned<SettingsSectionContribution>[]
  shapeDecorators: Owned<ShapeDecoratorContribution>[]
  pointDrops: Owned<PointDropContribution>[]
  pageCategories: Owned<PageCategoryContribution>[]
  contextMenuItems: Owned<ContextMenuContribution>[]
  pasteOptions: Owned<PasteOptionContribution>[]
  fileImporters: Owned<FileImporterContribution>[]
  textImporters: Owned<TextImporterContribution>[]
  connectionProbes: Owned<ConnectionProbeContribution>[]
  aiTools: Owned<AiTool>[]
  aiGuides: { plugin: string; name: string; guide: string }[]
  /** Shape type (or "*") → describers from every enabled plugin. */
  aiShapes: Record<string, AiShapeDescriber[]>
}

export interface PluginRuntime {
  plugins: readonly BoardPlugin[]
  enabled: ReadonlySet<string>
  /** Enabled plugins in registration order. */
  active: readonly BoardPlugin[]
  engine: Required<Pick<BoardPlugin, "shapeUtils" | "bindingUtils" | "tools">>
  contributions: Contributions
  /** tldraw UI tools owned by disabled plugins. */
  hiddenTldrawTools: ReadonlySet<string>
  setEnabled(id: string, on: boolean): void
}

const PluginRuntimeContext = createContext<PluginRuntime | null>(null)

/** The contributions that are lists of `{ id, order }` items, sorted by `order`. */
const LISTS = [
  "toolbar",
  "panels",
  "inspectorTabs",
  "inspectorSections",
  "menuItems",
  "commands",
  "topbarItems",
  "statusItems",
  "workspaces",
  "libraryCollections",
  "canvasOverlays",
  "canvasLayers",
  "canvasBackgrounds",
  "settingsSections",
  "shapeDecorators",
  "pointDrops",
  "pageCategories",
  "contextMenuItems",
  "pasteOptions",
  "fileImporters",
  "textImporters",
  "connectionProbes",
] as const satisfies readonly (keyof Contributions & keyof BoardPlugin)[]
type ListKey = (typeof LISTS)[number]

const listOf = (plugin: BoardPlugin, key: ListKey) =>
  (plugin[key] ?? []) as readonly { id: string; order: number }[]

function collect<K extends ListKey>(
  plugins: readonly BoardPlugin[],
  key: K
): Contributions[K] {
  const items = plugins.flatMap((plugin) =>
    listOf(plugin, key).map((item) => ({ ...item, pluginId: plugin.id }))
  )
  return items.sort((a, b) => a.order - b.order) as Contributions[K]
}

/** Every name a plugin brings that must not clash with another plugin's. */
function namesOf(plugin: BoardPlugin): PluginNames {
  return {
    id: plugin.id,
    required: plugin.required,
    engine: {
      shapes: (plugin.shapeUtils ?? []).map((util) => util.type),
      bindings: (plugin.bindingUtils ?? []).map((util) => util.type),
      tools: (plugin.tools ?? []).map((tool) => tool.id),
    },
    contributions: Object.fromEntries(
      LISTS.map((key) => [key, listOf(plugin, key).map((item) => item.id)])
    ),
  }
}

/** AI tool names are what AI apps call, so they must be valid and unique. */
function validateAiTools(plugins: readonly BoardPlugin[]): string[] {
  const errors: string[] = []
  const seen = new Map<string, string>()
  for (const plugin of plugins)
    for (const tool of plugin.ai?.tools ?? []) {
      if (!TOOL_NAME.test(tool.name))
        errors.push(`${plugin.id}: AI tool "${tool.name}" must be snake_case`)
      const owner = seen.get(tool.name)
      if (owner)
        errors.push(`${plugin.id}: AI tool "${tool.name}" is also in ${owner}`)
      seen.set(tool.name, plugin.id)
    }
  return errors
}

function collectAiShapes(
  plugins: readonly BoardPlugin[]
): Record<string, AiShapeDescriber[]> {
  const out: Record<string, AiShapeDescriber[]> = {}
  for (const plugin of plugins)
    for (const [type, describe] of Object.entries(plugin.ai?.shapes ?? {}))
      (out[type] ??= []).push(describe)
  return out
}

/** Engine pieces from every plugin, enabled or not, so saved boards always load. */
function collectEngine(
  plugins: readonly BoardPlugin[]
): PluginRuntime["engine"] {
  const unique = <T,>(items: readonly T[]) => [...new Set(items)]
  return {
    shapeUtils: unique(plugins.flatMap((p) => p.shapeUtils ?? [])),
    bindingUtils: unique(plugins.flatMap((p) => p.bindingUtils ?? [])),
    tools: unique(plugins.flatMap((p) => p.tools ?? [])),
  }
}

export function PluginRuntimeProvider({
  plugins,
  children,
}: {
  plugins: readonly BoardPlugin[]
  children: ReactNode
}) {
  useMemo(() => {
    const names = checkNames(plugins.map(namesOf))
    const errors = [
      ...validatePlugins(plugins),
      ...validateAiTools(plugins),
      ...names.errors,
    ]
    if (errors.length)
      throw new Error(`Invalid plugin registry:\n${errors.join("\n")}`)
    if (process.env.NODE_ENV === "development" && names.warnings.length)
      console.warn(`Plugin names:\n${names.warnings.join("\n")}`)
  }, [plugins])

  const preferences = useValue(studioState.pluginPreferences)
  const engine = useMemo(() => collectEngine(plugins), [plugins])
  const enabled = useMemo(
    () => resolveEnabled(plugins, preferences),
    [plugins, preferences]
  )
  const active = useMemo(
    () => plugins.filter((p) => enabled.has(p.id)),
    [plugins, enabled]
  )

  const contributions = useMemo<Contributions>(
    () => ({
      ...(Object.fromEntries(
        LISTS.map((key) => [key, collect(active, key)])
      ) as Pick<Contributions, ListKey>),
      aiTools: active.flatMap((plugin) =>
        (plugin.ai?.tools ?? []).map((tool) => ({
          ...tool,
          pluginId: plugin.id,
        }))
      ),
      aiGuides: active.flatMap((plugin) =>
        plugin.ai?.guide
          ? [{ plugin: plugin.id, name: plugin.name, guide: plugin.ai.guide }]
          : []
      ),
      aiShapes: collectAiShapes(active),
    }),
    [active]
  )

  const hiddenTldrawTools = useMemo(
    () =>
      new Set(
        plugins
          .filter((p) => !enabled.has(p.id))
          .flatMap((p) => p.ownsTldrawTools ?? [])
      ),
    [plugins, enabled]
  )

  const setEnabled = useCallback(
    (id: string, on: boolean) => {
      studioState.pluginPreferences.update((current) =>
        setPluginEnabled(plugins, current, id, on)
      )
    },
    [plugins]
  )

  const value = useMemo<PluginRuntime>(
    () => ({
      plugins,
      enabled,
      active,
      engine,
      contributions,
      hiddenTldrawTools,
      setEnabled,
    }),
    [
      plugins,
      enabled,
      active,
      engine,
      contributions,
      hiddenTldrawTools,
      setEnabled,
    ]
  )

  // Handy for poking at plugins from devtools (`lemscapePlugins.contributions`); never
  // shipped in production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "development")
      Object.assign(window, { lemscapePlugins: value })
  }, [value])

  return (
    <PluginRuntimeContext.Provider value={value}>
      {children}
    </PluginRuntimeContext.Provider>
  )
}

export function usePluginRuntime(): PluginRuntime {
  const runtime = useContext(PluginRuntimeContext)
  if (!runtime)
    throw new Error(
      "usePluginRuntime must be used inside PluginRuntimeProvider"
    )
  return runtime
}
