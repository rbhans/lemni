import type { ComponentType, ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLShape,
  TLShapeId,
  TLStateNodeConstructor,
  VecLike,
} from "tldraw"

import type { AiAccessLevel, JsonSchema } from "../ai/schema"
import type { PointDragData } from "../data/live-points"
import type { PageCategory, PageKind } from "../pages/categories"
import type { PluginNode } from "./registry"

export type { PageKind }

export type PluginCategoryId =
  "core" | "drawing" | "libraries" | "data" | "media" | "connections" | "ai"

export const PLUGIN_CATEGORIES: { id: PluginCategoryId; label: string }[] = [
  { id: "core", label: "Core" },
  { id: "drawing", label: "Drawing" },
  { id: "libraries", label: "Libraries" },
  { id: "data", label: "Data & charts" },
  { id: "media", label: "Media & import" },
  { id: "connections", label: "Connections" },
  { id: "ai", label: "AI" },
]

/** What a contribution callback can reach. Kept small on purpose. */
export interface StudioContext {
  editor: Editor
  /** Runs a tldraw UI action by id (undo, group, zoom-to-fit, ...). */
  runAction(id: string): void
  /** Selects a tldraw UI tool by id (draw, rectangle, frame, ...). */
  selectTool(id: string): void
  setWorkspace(id: string): void
  openPanel(id: string): void
  /** Opens the properties panel on a tab (Design, Behavior, …). */
  openInspectorTab(id: string): void
}

export interface ToolItem {
  id: string
  label: string
  icon: IconSvgElement
  /** A tldraw UI tool id (see `useTools`). Selecting it runs tldraw's own handler. */
  tool?: string
  /** For items that are not tldraw tools (insert media, add web view, ...). */
  onSelect?(ctx: StudioContext): void
  kbd?: string
}

export interface ToolbarContribution extends ToolItem {
  group: "navigate" | "draw" | "insert" | "present"
  order: number
  /** Shown as a split dropdown; the last used variant becomes the button. */
  variants?: ToolItem[]
  /** Page kinds the tool shows on (default: UI and Documents pages). */
  pageKinds?: PageKind[]
}

export interface PanelContribution {
  id: string
  title: string
  icon: IconSvgElement
  side: "left" | "right"
  order: number
  /** Workspaces that show this panel. */
  workspaces: string[]
  width?: number
  component: ComponentType
}

export interface InspectorTabContribution {
  id: string
  label: string
  order: number
  /** Show the tab only when this returns true. Reactive: read editor state inside. */
  when?(editor: Editor): boolean
  component?: ComponentType
  /** Small count shown on the tab, e.g. number of behaviors on the selection. */
  badge?(editor: Editor): number | null
}

export interface InspectorSectionContribution {
  id: string
  tab: string
  title: string
  order: number
  /** Show only when this returns true. Reactive: read editor state inside. */
  when?(editor: Editor): boolean
  component: ComponentType
  /** Small caption shown next to the title, e.g. which library added it. */
  badge?: string
}

export type MenuId =
  "file" | "edit" | "object" | "arrange" | "view" | "insert" | "window" | "help"

export interface MenuItemContribution {
  id: string
  menu: MenuId
  /** Items with the same group are kept together between separators. */
  group: string
  order: number
  label: string
  /** A tldraw UI action id. Its shortcut is shown automatically. */
  action?: string
  onSelect?(ctx: StudioContext): void
  kbd?: string
  checked?(editor: Editor): boolean
  disabled?(editor: Editor): boolean
}

/** A command-palette entry (menus, tools, panels and library items are listed automatically). */
export interface CommandContribution {
  id: string
  label: string
  /** Heading it's listed under, e.g. "Behaviors". */
  group: string
  order: number
  /** Extra search words. */
  keywords?: string[]
  /** Shortcut, e.g. "cmd+shift+p"; bound globally and shown in the shortcut sheet. */
  kbd?: string
  run(ctx: StudioContext): void
  /** Hide the command when this returns false. */
  when?(editor: Editor): boolean
}

export interface SlotContribution {
  id: string
  order: number
  component: ComponentType
}

export interface StatusContribution extends SlotContribution {
  align: "start" | "end"
}

/** Wraps how every shape renders, e.g. to animate it. Must render `children`. */
export interface ShapeDecoratorContribution {
  id: string
  order: number
  component: ComponentType<{
    shape: TLShape
    isBackground: boolean
    children: ReactNode
  }>
}

export interface WorkspaceContribution {
  id: string
  label: string
  icon: IconSvgElement
  order: number
  defaultLeftPanel: string | null
  /** A right panel id, or "inspector" for the properties panel. */
  rightPanel: string | null
  showToolDock?: boolean
}

export interface LibraryItem {
  id: string
  label: string
  /** Preview drawn in the tile. */
  preview: ReactNode
  keywords?: string[]
  insert(ctx: StudioContext, point: VecLike): void
}

export interface LibraryCollectionContribution {
  id: string
  /** Library tab this collection lives under. */
  tab: { id: string; label: string; order: number }
  title: string
  order: number
  items: LibraryItem[]
  /** Page kinds the collection shows on (default: UI pages). */
  pageKinds?: PageKind[]
}

/** A category of pages a plugin brings (people can add their own on the board). */
export type PageCategoryContribution = Omit<PageCategory, "custom">

/** An entry in the canvas right-click menu. */
export interface ContextMenuContribution {
  id: string
  /** Items with the same group are kept together between separators. */
  group: string
  order: number
  label: string | ((editor: Editor) => string)
  /** Show the item only when this returns true. */
  when?(editor: Editor): boolean
  disabled?(editor: Editor): boolean
  onSelect(ctx: StudioContext): void
}

/** Opens files dropped on (or added to) the board, e.g. PDFs as document cards. */
export interface FileImporterContribution {
  id: string
  order: number
  /** Types for file pickers, e.g. ".pdf" or "application/pdf". */
  accept: string[]
  accepts(file: File): boolean
  import(
    ctx: StudioContext,
    files: File[],
    point: VecLike | undefined
  ): Promise<void>
}

/**
 * Something a pasted shape can carry (behaviors, links, ...). Plain paste leaves it
 * out; Paste special lists it as a checkbox.
 */
export interface PasteOptionContribution {
  id: string
  label: string
  order: number
  /** Removes what this option carries from a shape about to be pasted without it. */
  strip?(shape: TLShape): TLShape
  /** At copy time, anything extra to carry along (e.g. links touching the shapes). */
  capture?(editor: Editor, shapeIds: readonly TLShapeId[]): unknown
  /** After a paste with this option on: re-apply what was captured, given old → new ids. */
  restore?(
    ctx: StudioContext,
    ids: ReadonlyMap<TLShapeId, TLShapeId>,
    captured: unknown
  ): void
}

/**
 * Takes points dragged onto the canvas (from the Station panel): one point, or every
 * point in a dropped folder. Contributions are tried in order: the first one that
 * claims the shape under the pointer gets the drop.
 */
export interface PointDropContribution {
  id: string
  order: number
  /** Handles several points at once. Others are skipped when a folder is dropped. */
  multiple?: boolean
  /** The shape this contribution would take a drop for, given the innermost shape hit. */
  target?(editor: Editor, hit: TLShape): TLShape | null
  /** Handles a drop onto the shape returned by `target`. */
  drop?(ctx: StudioContext, shape: TLShape, points: PointDragData[]): void
  /** Offered when points are dropped on empty canvas, e.g. "Trend chart". */
  create?: {
    label: string
    icon: IconSvgElement
    run(ctx: StudioContext, points: PointDragData[], at: VecLike): void
  }
}

/** What an AI tool call can reach. */
export interface AiToolContext extends StudioContext {
  /** The AI app that asked, e.g. "Claude Code". */
  client: string
  access: AiAccessLevel
  /** Aborted when the AI app gives up on the call. */
  signal: AbortSignal
  /** How a shape reads to the AI: common fields plus what its plugin adds. */
  describeShape(shape: TLShape): Record<string, unknown>
  /** Page categories on this board (plugin ones and the board's own). */
  categories(): PageCategory[]
  /** What each enabled plugin tells the AI about itself. */
  guides: readonly { plugin: string; name: string; guide: string }[]
  /** Library collections from enabled plugins. */
  libraryCollections: readonly LibraryCollectionContribution[]
}

/** What a tool sends back. Throw an Error (with a message for the AI) to fail. */
export interface AiReply {
  /** A sentence or two for the AI (and the activity list). */
  text?: string
  /** Structured details, sent as JSON. */
  data?: unknown
  images?: { data: string; mimeType: "image/png" | "image/jpeg" }[]
}

interface AiToolBase {
  /** snake_case, unique across plugins. */
  name: string
  title: string
  /** For the AI: what it does, when to use it, what it returns. */
  description: string
  inputSchema: JsonSchema & { type: "object" }
  timeoutMs?: number
}

/** Reads (`read`) or changes the board (`edit`, one undo step per call). */
export interface AiBoardTool<Input = Record<string, never>> extends AiToolBase {
  access: "read" | "edit"
  run(ctx: AiToolContext, input: Input): AiReply | Promise<AiReply>
}

/**
 * Changes something outside the board (a station). `prepare` checks the request and
 * describes it; nothing happens unless the person chooses Allow once, then `commit`.
 */
export interface AiWriteTool<Input = Record<string, never>> extends AiToolBase {
  access: "write"
  prepare(ctx: AiToolContext, input: Input): Promise<AiWritePlan>
}

export type AiTool<Input = never> = AiBoardTool<Input> | AiWriteTool<Input>

export interface AiWritePlan {
  /** e.g. "Write 3 points". */
  title: string
  /** Where it goes, e.g. the station's name. */
  target: string
  rows: { label: string; detail?: string; from?: string; to: string }[]
  risk: "normal" | "high"
  /** The AI's reason, shown to the person. */
  reason: string
  warnings?: string[]
  /** The final "are you sure?" button, e.g. "Yes, write now". */
  confirmLabel?: string
  commit(): Promise<AiReply>
}

/** Describes a plugin's shapes to the AI (keyed by shape type; "*" for every shape). */
export type AiShapeDescriber = (
  editor: Editor,
  shape: TLShape
) => Record<string, unknown> | null

export interface AiContribution {
  /** A few sentences on what the plugin adds and how an AI should use it. */
  guide?: string
  tools?: AiTool[]
  shapes?: Record<string, AiShapeDescriber>
}

export interface BoardPlugin extends PluginNode {
  name: string
  description: string
  category: PluginCategoryId
  icon: IconSvgElement

  // Engine registrations. Always registered, whether or not the plugin is on,
  // so saved boards keep loading. Enablement gates everything below.
  shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  tools?: readonly TLStateNodeConstructor[]
  /** tldraw UI tools this plugin owns. They lose their shortcuts when it is off. */
  ownsTldrawTools?: readonly string[]

  toolbar?: ToolbarContribution[]
  panels?: PanelContribution[]
  inspectorTabs?: InspectorTabContribution[]
  inspectorSections?: InspectorSectionContribution[]
  menuItems?: MenuItemContribution[]
  commands?: CommandContribution[]
  topbarItems?: SlotContribution[]
  statusItems?: StatusContribution[]
  workspaces?: WorkspaceContribution[]
  libraryCollections?: LibraryCollectionContribution[]
  /** UI floating over the canvas (screen space). */
  canvasOverlays?: SlotContribution[]
  /** Content drawn on the canvas in page space (moves and zooms with the board). */
  canvasLayers?: SlotContribution[]
  shapeDecorators?: ShapeDecoratorContribution[]
  pointDrops?: PointDropContribution[]
  pageCategories?: PageCategoryContribution[]
  contextMenuItems?: ContextMenuContribution[]
  pasteOptions?: PasteOptionContribution[]
  fileImporters?: FileImporterContribution[]
  /** Tools, guidance and shape descriptions for AI apps connected over MCP. */
  ai?: AiContribution
  providers?: ComponentType<{ children: ReactNode }>[]
  onEditorMount?(ctx: StudioContext): void | (() => void)
}

/** Human-readable list of what a plugin adds, for the plugin manager. */
export function describeContributions(plugin: BoardPlugin): string[] {
  const out: string[] = []
  if (plugin.toolbar?.length) out.push("Tools")
  if (plugin.shapeUtils?.length) out.push("Shapes")
  if (plugin.libraryCollections?.length) out.push("Library")
  if (plugin.panels?.length) out.push("Panel")
  if (plugin.inspectorTabs?.length) out.push("Property tab")
  if (plugin.inspectorSections?.length) out.push("Properties")
  if (plugin.workspaces?.length) out.push("Workspace")
  if (plugin.ai?.tools?.length) out.push("AI tools")
  if (plugin.topbarItems?.length || plugin.statusItems?.length)
    out.push("Status")
  return out
}
