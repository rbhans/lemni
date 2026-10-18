"use client"

import { BrowserIcon } from "@hugeicons/core-free-icons"

import { definePlugin, type BoardPlugin } from "@/sdk"

import { webViewAi } from "./ai-tools"
import { normalizeAddress } from "./model"
import { createWebView, hasWebSelected, WebSection } from "./web-section"
import { WebShapeUtil } from "./web-shape"

/** A pasted link the web view may show (not the board itself, no login in it). */
function viewable(url: URL | undefined): string | null {
  if (!url) return null
  const result = normalizeAddress(url.href, window.location.origin)
  return "url" in result ? result.url : null
}

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

export default definePlugin({
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
  textImporters: [
    {
      id: "web-view",
      order: 20,
      label: "Web view",
      icon: BrowserIcon,
      accepts: ({ url }) => viewable(url) !== null,
      import: ({ editor }, { url }, at) => {
        const address = viewable(url)
        if (address) createWebView(editor, at, address)
      },
    },
  ],
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
})
