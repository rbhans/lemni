import {
  Cursor01Icon,
  FrameIcon,
  HandIcon,
  Layers01Icon,
  LibraryIcon,
} from "@hugeicons/core-free-icons"
import {
  defaultBindingUtils,
  defaultShapeTools,
  defaultShapeUtils,
  defaultTools,
} from "tldraw"

import { definePlugin } from "@/sdk"

import { canvasAi } from "./ai-tools"
import { RailSettings } from "./interface-settings"
import { LayersPanel } from "./layers-panel"
import { LibraryPanel } from "./library-panel"
import { coreMenuItems } from "./menus"
import {
  AlignSection,
  ArrangeSection,
  hasSelection,
  TransformSection,
} from "./sections"
import {
  CursorStatus,
  GuidesStatus,
  PageStatus,
  SelectionStatus,
  ZoomStatus,
} from "./status"

export default definePlugin({
  id: "canvas-core",
  name: "Canvas core",
  version: "0.1.0",
  description:
    "Select, hand, frames, groups, pages, layers, library, undo and snapping.",
  category: "core",
  icon: Layers01Icon,
  required: true,

  // Every default tldraw shape and tool is registered here, so any saved board
  // loads even when the plugin that draws a shape is turned off.
  shapeUtils: defaultShapeUtils,
  bindingUtils: defaultBindingUtils,
  tools: [...defaultTools, ...defaultShapeTools],
  ownsTldrawTools: ["select", "hand", "zoom", "frame"],
  ai: canvasAi,

  pageCategories: [
    { id: "documents", label: "Documents", kind: "documents", order: 10 },
    { id: "ui", label: "UI", kind: "ui", order: 20 },
  ],

  toolbar: [
    {
      id: "select",
      group: "navigate",
      order: 10,
      label: "Select",
      icon: Cursor01Icon,
      tool: "select",
      pageKinds: ["ui", "documents", "wiresheet"],
    },
    {
      id: "hand",
      group: "navigate",
      order: 20,
      label: "Hand",
      icon: HandIcon,
      tool: "hand",
      pageKinds: ["ui", "documents", "wiresheet"],
    },
    {
      id: "frame",
      group: "insert",
      order: 10,
      label: "Frame",
      icon: FrameIcon,
      tool: "frame",
    },
  ],

  workspaces: [
    {
      id: "canvas",
      label: "Canvas",
      icon: Layers01Icon,
      order: 10,
      defaultLeftPanel: "layers",
      rightPanel: "inspector",
    },
  ],

  panels: [
    {
      id: "layers",
      title: "Layers",
      group: "board",
      icon: Layers01Icon,
      side: "left",
      order: 10,
      workspaces: ["canvas"],
      component: LayersPanel,
    },
    {
      id: "library",
      title: "Library",
      group: "board",
      icon: LibraryIcon,
      side: "left",
      order: 20,
      workspaces: ["canvas"],
      component: LibraryPanel,
    },
  ],

  settingsSections: [
    {
      id: "panel-rail",
      page: "Interface",
      title: "Panel rail",
      description: "The column of panel icons on the left.",
      order: 10,
      component: RailSettings,
    },
  ],

  inspectorTabs: [{ id: "design", label: "Design", order: 10 }],
  inspectorSections: [
    {
      id: "transform",
      tab: "design",
      title: "Transform",
      order: 10,
      when: hasSelection,
      component: TransformSection,
    },
    {
      id: "align",
      tab: "design",
      title: "Align",
      order: 20,
      when: hasSelection,
      component: AlignSection,
    },
    {
      id: "arrange",
      tab: "design",
      title: "Arrange",
      order: 90,
      when: hasSelection,
      component: ArrangeSection,
    },
  ],

  menuItems: coreMenuItems,

  statusItems: [
    { id: "page", align: "start", order: 10, component: PageStatus },
    { id: "selection", align: "start", order: 20, component: SelectionStatus },
    { id: "cursor", align: "start", order: 30, component: CursorStatus },
    { id: "guides", align: "end", order: 10, component: GuidesStatus },
    { id: "zoom", align: "end", order: 20, component: ZoomStatus },
  ],
})
