import type { ComponentType, ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLShape,
  TLShapeId,
  Signal,
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

/** Where a left panel sits in the rail. Groups are split by a divider, in this order. */
export type PanelGroup = "board" | "connections" | "ai"

export const PANEL_GROUPS: readonly { id: PanelGroup; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "connections", label: "Connections" },
  { id: "ai", label: "AI" },
]

export interface PanelContribution {
  id: string
  title: string
  /** Short name under the rail icon when labels are on (default: the title). */
  railLabel?: string
  /** Rail group (default "board"). */
  group?: PanelGroup
  icon: IconSvgElement
  /** An icon that follows state, shown in the rail instead of `icon` (a connection's, dashed while it's not connected). */
  currentIcon?: Signal<IconSvgElement>
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

/** A block of controls in the Settings dialog, listed under its page. */
export interface SettingsSectionContribution {
  id: string
  /** Page it's listed under in the dialog's sidebar, e.g. "Canvas". */
  page: string
  title: string
  /** One line under the title saying what the settings do. */
  description?: string
  order: number
  component: ComponentType
}

/** A full-viewport layer painted behind the grid; one is shown at a time, picked in View. */
export interface CanvasBackgroundContribution {
  id: string
  order: number
  label: string
  component: ComponentType
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

/** Text pasted or dropped on the board, as text importers see it. */
export interface PastedText {
  /** The plain text (rows copied from a spreadsheet come tab-separated). */
  text: string
  /** The HTML that came with it, when the source sent some (a spreadsheet's table). */
  html?: string
  /** Set when the text is one web address. */
  url?: URL
}

/**
 * Something pasted or dropped text can become: a link as a web view, rows copied from
 * a spreadsheet as a table. When more than one thing suits the text, counting the
 * board's own default (a link card, or plain text), a menu at the drop point offers
 * them.
 */
export interface TextImporterContribution {
  id: string
  order: number
  label: string
  icon: IconSvgElement
  /** Whether it suits this text: a link, rows from a spreadsheet, … */
  accepts(content: PastedText): boolean
  /** Listed first, ahead of the board's default, e.g. a table for copied rows. */
  suggested?(content: PastedText): boolean
  /** Page kinds it's offered on (default: UI and Documents pages). */
  pageKinds?: PageKind[]
  import(
    ctx: StudioContext,
    content: PastedText,
    point: VecLike
  ): void | Promise<void>
}

/** What a connection probe found at an address. */
export interface ConnectionMatch {
  /** What answered, e.g. "Niagara station". */
  title: string
  /** What gave it away, in a few words: "Niagara sign-in page · self-signed certificate". */
  detail?: string
  /** The address to connect to, with the scheme and port the probe found. */
  address: string
  /** "certain" when the system said what it is, "likely" from signs. */
  confidence: "certain" | "likely"
  /** Anything the plugin wants back in `open` (that the certificate is self-signed, say). */
  data?: unknown
}

/**
 * Recognizes one kind of building system at an address, for Connect… (File →
 * Connect…, the + under the connection panels, a pasted link). Every enabled probe
 * checks the address; the person picks from what answered and `open` shows that
 * connection's form, filled in.
 */
export interface ConnectionProbeContribution {
  id: string
  order: number
  /** The kind of system, e.g. "Niagara station". */
  label: string
  icon: IconSvgElement
  /** No network: could this pasted web address be one? Then pasting it offers Connect…. */
  recognizes?(url: URL): boolean
  /**
   * Checks the address through the plugin's own server routes (`probeHttp` in
   * `@/sdk/server` does the asking). Resolves to what it found, or null when something
   * else answers there; throws an Error with a sentence when nothing answers at all.
   * `signal` aborts when the person closes Connect.
   */
  probe(address: string, signal: AbortSignal): Promise<ConnectionMatch | null>
  /** Opens the connection's form filled in with the address, and the match when there is one. */
  open(ctx: StudioContext, address: string, match: ConnectionMatch | null): void
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
/** A flyout in the menu for points dropped on empty canvas ("Data", "HVAC", "UI"). */
export interface PointMenuGroup {
  id: string
  label: string
  order: number
}

/** One thing a dropped point can become, e.g. "Trend chart" or "Fan". */
export interface PointCreateOption {
  id: string
  label: string
  icon: IconSvgElement
  /** Takes several points at once (a dropped folder). */
  multiple?: boolean
  /** Whether it suits these points (default: yes). */
  accepts?(points: PointDragData[]): boolean
  /** Listed first in its flyout, e.g. a fan for a fan status point. */
  suggested?(points: PointDragData[]): boolean
  /** A heading the option sits under within its flyout ("Air side"). */
  section?: string
  /** Shown instead of the icon (a symbol's own drawing). */
  preview?: ReactNode
  run(ctx: StudioContext, points: PointDragData[], at: VecLike): void
}

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
  /** More things to offer on empty canvas (each its own row). */
  creates?: PointCreateOption[]
  /** The flyout `create` and `creates` go under; none: the menu's top level. */
  group?: PointMenuGroup
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
  /** Who made it, shown in the plugin manager (omit for plugins that ship with the app). */
  author?: string
  /** Where to read more about it, shown in the plugin manager. */
  url?: string

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
  /** Sections of the Settings dialog (File → Settings…). */
  settingsSections?: SettingsSectionContribution[]
  /** Backgrounds behind the grid, picked in Settings → Canvas. */
  canvasBackgrounds?: CanvasBackgroundContribution[]
  shapeDecorators?: ShapeDecoratorContribution[]
  pointDrops?: PointDropContribution[]
  pageCategories?: PageCategoryContribution[]
  contextMenuItems?: ContextMenuContribution[]
  pasteOptions?: PasteOptionContribution[]
  fileImporters?: FileImporterContribution[]
  /** What pasted or dropped text and links can become (a web view, a table). */
  textImporters?: TextImporterContribution[]
  /** Recognizes a building system at an address someone types, for Connect…. */
  connectionProbes?: ConnectionProbeContribution[]
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
  if (plugin.canvasBackgrounds?.length) out.push("Backgrounds")
  if (plugin.settingsSections?.length) out.push("Settings")
  if (plugin.ai?.tools?.length) out.push("AI tools")
  if (plugin.topbarItems?.length || plugin.statusItems?.length)
    out.push("Status")
  return out
}
