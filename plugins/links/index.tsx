"use client"

import { Link01Icon } from "@hugeicons/core-free-icons"
import { react, type Editor } from "tldraw"

import {
  addLinks,
  endLabel,
  getLinks,
  installLinkPruning,
  linkMark,
  linkToMark,
  markForLink,
  newLinkId,
  selectedLink,
} from "@/studio/links/links"
import {
  connects,
  remapLinks,
  sameEnd,
  shapeOf,
  type BoardLink,
  type LinkEnd,
} from "@/studio/links/model"
import type { PageCategory } from "@/studio/pages/categories"
import { createPageIn, currentPageKind } from "@/studio/pages/page-categories"
import type { BoardPlugin } from "@/studio/plugins/types"

import { linksAi } from "./ai-tools"
import { LinkBadges } from "./badges"
import { LINK_END_DRAG_TYPE, LinksPanel } from "./links-panel"
import { endForSelection, hasLinkContext, LinksSection } from "./links-section"
import { LinkOverlays } from "./overlays"
import {
  addNode,
  findWireSheet,
  installWireSheet,
  NodeShapeUtil,
} from "./wire-sheet"
import { WiresLayer } from "./wires-layer"

const WIRE_SHEET: PageCategory = {
  id: "wiresheet",
  label: "Wire sheet",
  kind: "wiresheet",
  order: 90,
  single: true,
}

/** What a right-click or command acts on: the selection, or the page itself. */
function endHere(editor: Editor): LinkEnd | null {
  const fromSelection = endForSelection(editor)
  if (fromSelection) return fromSelection
  if (editor.getSelectedShapeIds().length) return null
  if (currentPageKind(editor) === "wiresheet") return null
  return { kind: "page", pageId: editor.getCurrentPageId() }
}

const canLinkHere = (editor: Editor) => {
  const mark = linkMark.get()
  const end = endHere(editor)
  if (!mark || !end || sameEnd(mark, end)) return false
  return !getLinks(editor).some((link) => connects(link, mark, end))
}

function openWireSheet(editor: Editor) {
  const page = findWireSheet(editor)
  if (page) editor.setCurrentPage(page.id)
  else createPageIn(editor, WIRE_SHEET)
}

/** Dropping a Links panel row on the wire sheet places (and pins) its box there. */
function installWireSheetDrop(editor: Editor): () => void {
  const container = editor.getContainer()
  const accepts = (event: DragEvent) =>
    currentPageKind(editor) === "wiresheet" &&
    Boolean(event.dataTransfer?.types.includes(LINK_END_DRAG_TYPE))
  const onDragOver = (event: DragEvent) => {
    if (!accepts(event)) return
    event.preventDefault()
    event.dataTransfer!.dropEffect = "copy"
  }
  const onDrop = (event: DragEvent) => {
    if (!accepts(event)) return
    event.preventDefault()
    event.stopPropagation()
    const page = findWireSheet(editor)
    if (!page) return
    try {
      const end = JSON.parse(
        event.dataTransfer!.getData(LINK_END_DRAG_TYPE)
      ) as LinkEnd
      const at = editor.screenToPage({ x: event.clientX, y: event.clientY })
      editor.markHistoryStoppingPoint("add to wire sheet")
      addNode(editor, page, end, { x: at.x - 110, y: at.y - 28 }, true)
    } catch {
      // Not a row we understand.
    }
  }
  container.addEventListener("dragover", onDragOver, true)
  container.addEventListener("drop", onDrop, true)
  return () => {
    container.removeEventListener("dragover", onDragOver, true)
    container.removeEventListener("drop", onDrop, true)
  }
}

export const links: BoardPlugin = {
  id: "links",
  name: "Links",
  version: "0.1.0",
  description:
    "Link frames, document pages, pages and station items, with a comment for context. A generated wire sheet shows how everything connects.",
  category: "core",
  icon: Link01Icon,
  ai: linksAi,
  stage: "preview",
  shapeUtils: [NodeShapeUtil],
  pageCategories: [WIRE_SHEET],
  panels: [
    {
      id: "links",
      title: "Links",
      group: "board",
      icon: Link01Icon,
      side: "left",
      order: 25,
      workspaces: ["canvas"],
      width: 280,
      component: LinksPanel,
    },
  ],
  inspectorSections: [
    {
      id: "links",
      tab: "design",
      title: "Links",
      order: 80,
      when: hasLinkContext,
      component: LinksSection,
    },
  ],
  canvasLayers: [
    { id: "wires", order: 5, component: WiresLayer },
    { id: "link-badges", order: 20, component: LinkBadges },
  ],
  canvasOverlays: [{ id: "link-overlays", order: 20, component: LinkOverlays }],
  contextMenuItems: [
    {
      id: "link-mark",
      group: "links",
      order: 10,
      label: (editor) =>
        editor.getSelectedShapeIds().length
          ? "Link mark"
          : "Link mark this page",
      when: (editor) => endHere(editor) !== null,
      onSelect: ({ editor }) => {
        const end = endHere(editor)
        if (end) markForLink(end)
      },
    },
    {
      id: "link-to-mark",
      group: "links",
      order: 20,
      label: (editor) => {
        const mark = linkMark.get()
        return mark ? `Link to ${endLabel(editor, mark)}` : "Link"
      },
      when: canLinkHere,
      onSelect: ({ editor }) => {
        const end = endHere(editor)
        if (end) linkToMark(editor, end)
      },
    },
  ],
  commands: [
    {
      id: "link-mark",
      label: "Link mark",
      group: "Links",
      order: 10,
      keywords: ["link", "mark", "connect"],
      when: (editor) => endHere(editor) !== null,
      run: ({ editor }) => {
        const end = endHere(editor)
        if (end) markForLink(end)
      },
    },
    {
      id: "link-to-mark",
      label: "Link to marked",
      group: "Links",
      order: 20,
      keywords: ["link", "connect"],
      when: canLinkHere,
      run: ({ editor }) => {
        const end = endHere(editor)
        if (end) linkToMark(editor, end)
      },
    },
    {
      id: "clear-link-mark",
      label: "Clear link mark",
      group: "Links",
      order: 30,
      keywords: ["link", "mark"],
      when: () => linkMark.get() !== null,
      run: () => linkMark.set(null),
    },
    {
      id: "open-wire-sheet",
      label: "Open the wire sheet",
      group: "Links",
      order: 40,
      keywords: ["links", "wire", "sheet", "graph"],
      run: ({ editor }) => openWireSheet(editor),
    },
  ],
  pasteOptions: [
    {
      id: "links",
      label: "Links",
      order: 20,
      capture(editor, shapeIds) {
        const ids = new Set<string>(shapeIds)
        return getLinks(editor).filter((link) =>
          [link.a, link.b].some((end) => {
            const shape = shapeOf(end)
            return shape !== null && ids.has(shape)
          })
        )
      },
      restore({ editor }, ids, captured) {
        addLinks(
          editor,
          remapLinks(
            captured as BoardLink[],
            ids as ReadonlyMap<string, string>,
            newLinkId
          )
        )
      },
    },
  ],
  onEditorMount({ editor }) {
    const stopPruning = installLinkPruning(editor)
    const stopSheet = installWireSheet(editor)
    const stopDrop = installWireSheetDrop(editor)
    // A picked wire stays picked only until something else is selected or the page changes.
    let page = editor.getCurrentPageId()
    const stopSelection = react("clear picked wire", () => {
      const selected = editor.getSelectedShapeIds().length > 0
      const current = editor.getCurrentPageId()
      if ((selected || current !== page) && selectedLink.get())
        selectedLink.set(null)
      page = current
    })
    return () => {
      stopPruning()
      stopSheet()
      stopDrop()
      stopSelection()
    }
  },
}
