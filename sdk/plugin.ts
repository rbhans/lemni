// Declaring a plugin: the descriptor, every contribution it can carry, and the runtime
// that collects them from the plugins that are turned on.

import { SDK_VERSION } from "@/studio/plugins/registry"
import type { BoardPlugin } from "@/studio/plugins/types"

export { SDK_VERSION }

export type {
  AiBoardTool,
  AiContribution,
  AiReply,
  AiShapeDescriber,
  AiTool,
  AiToolContext,
  AiWritePlan,
  AiWriteTool,
  BoardPlugin,
  CanvasBackgroundContribution,
  CommandContribution,
  ConnectionMatch,
  ConnectionProbeContribution,
  ContextMenuContribution,
  FileImporterContribution,
  InspectorSectionContribution,
  InspectorTabContribution,
  LibraryCollectionContribution,
  LibraryItem,
  MenuId,
  MenuItemContribution,
  PageCategoryContribution,
  PageKind,
  PanelContribution,
  PanelGroup,
  PastedText,
  PasteOptionContribution,
  PluginCategoryId,
  PointCreateOption,
  PointDropContribution,
  PointMenuGroup,
  SettingsSectionContribution,
  ShapeDecoratorContribution,
  SlotContribution,
  StatusContribution,
  StudioContext,
  TextImporterContribution,
  ToolbarContribution,
  ToolItem,
  WorkspaceContribution,
} from "@/studio/plugins/types"

export {
  describeContributions,
  PANEL_GROUPS,
  PLUGIN_CATEGORIES,
} from "@/studio/plugins/types"

export type { Contributions, PluginRuntime } from "@/studio/plugins/runtime"

/**
 * The plugins that exist, the ones turned on, and everything they contribute (sorted
 * by `order`). Only usable inside the studio.
 */
export { usePluginRuntime } from "@/studio/plugins/runtime"

/**
 * Declares a plugin. Each plugin's `index.tsx` default-exports one:
 *
 * ```tsx
 * export default definePlugin({
 *   id: "my-plugin",
 *   name: "My plugin",
 *   version: "0.1.0",
 *   requiresSdk: "1.0.0",
 *   description: "What it adds, in a sentence or two.",
 *   category: "data",
 *   icon: PuzzleIcon,
 *   panels: [ ... ],
 * })
 * ```
 *
 * It returns the descriptor unchanged; it's there for autocomplete and type checks.
 */
export function definePlugin(plugin: BoardPlugin): BoardPlugin {
  return plugin
}
