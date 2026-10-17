"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import { useValue } from "tldraw"

import { TOOL_NAME } from "../ai/schema"
import { studioState } from "../state"
import { resolveEnabled, setPluginEnabled, validatePlugins } from "./registry"
import type {
  AiShapeDescriber,
  AiTool,
  BoardPlugin,
  InspectorSectionContribution,
  InspectorTabContribution,
  LibraryCollectionContribution,
  CommandContribution,
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

function collect<K extends keyof Contributions>(
  plugins: readonly BoardPlugin[],
  key: K
): Contributions[K] {
  const items = plugins.flatMap((plugin) =>
    (
      (plugin[key as keyof BoardPlugin] as { order: number }[] | undefined) ??
      []
    ).map((item) => ({
      ...item,
      pluginId: plugin.id,
    }))
  )
  return items.sort((a, b) => a.order - b.order) as Contributions[K]
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
    const errors = [...validatePlugins(plugins), ...validateAiTools(plugins)]
    if (errors.length)
      throw new Error(`Invalid plugin registry:\n${errors.join("\n")}`)
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
      toolbar: collect(active, "toolbar"),
      panels: collect(active, "panels"),
      inspectorTabs: collect(active, "inspectorTabs"),
      inspectorSections: collect(active, "inspectorSections"),
      menuItems: collect(active, "menuItems"),
      commands: collect(active, "commands"),
      topbarItems: collect(active, "topbarItems"),
      statusItems: collect(active, "statusItems"),
      workspaces: collect(active, "workspaces"),
      libraryCollections: collect(active, "libraryCollections"),
      canvasOverlays: collect(active, "canvasOverlays"),
      canvasLayers: collect(active, "canvasLayers"),
      canvasBackgrounds: collect(active, "canvasBackgrounds"),
      settingsSections: collect(active, "settingsSections"),
      shapeDecorators: collect(active, "shapeDecorators"),
      pointDrops: collect(active, "pointDrops"),
      pageCategories: collect(active, "pageCategories"),
      contextMenuItems: collect(active, "contextMenuItems"),
      pasteOptions: collect(active, "pasteOptions"),
      fileImporters: collect(active, "fileImporters"),
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
