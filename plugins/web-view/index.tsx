"use client"

import { BrowserIcon } from "@hugeicons/core-free-icons"

import type { BoardPlugin } from "@/studio/plugins/types"

import { webViewAi } from "./ai-tools"
import { createWebView, hasWebSelected, WebSection } from "./web-section"
import { WebShapeUtil } from "./web-shape"

const insert: BoardPlugin["toolbar"] = [
  {
    id: "insert-web-view",
    group: "insert",
    // Right after "Insert image or video".
    order: 21,
    label: "Insert web page",
    icon: BrowserIcon,
    onSelect: ({ editor }) =>
      createWebView(editor, editor.getViewportPageBounds().center),
  },
]

export const webView: BoardPlugin = {
  id: "web-view",
  name: "Web view",
  version: "0.1.0",
  description:
    "A browser window on the canvas, e.g. a Niagara station's own pages or a vendor portal. Double-click to use it; it's live in Present mode.",
  category: "media",
  icon: BrowserIcon,
  stage: "preview",
  ai: webViewAi,
  shapeUtils: [WebShapeUtil],
  toolbar: insert,
  menuItems: [
    {
      id: "insert-web-view",
      menu: "insert",
      group: "files",
      order: 1000,
      label: "Web page…",
      onSelect: ({ editor }) =>
        createWebView(editor, editor.getViewportPageBounds().center),
    },
  ],
  inspectorSections: [
    {
      id: "web-view",
      tab: "design",
      title: "Web view",
      order: 15,
      when: hasWebSelected,
      component: WebSection,
    },
  ],
}
