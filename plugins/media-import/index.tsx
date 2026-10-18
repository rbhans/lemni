"use client"

import { FileUploadIcon, Image01Icon } from "@hugeicons/core-free-icons"
import type { Editor } from "tldraw"

import { definePlugin } from "@/sdk"

import { mediaImportAi } from "./ai-tools"
import { DocShapeUtil } from "./doc-shape"
import { importDocuments } from "./import"
import { offerPointsList } from "./live-points"
import { DOCUMENT_ACCEPT, documentKind } from "./model"
import { tablePaste } from "./paste"
import { hasPointsListSelected, SheetPointsSection } from "./sheet-points"
import { SheetShapeUtil } from "./sheet-shape"

const IMAGE_ACCEPT = ["image/*", "video/*"]

/** Opens a file picker; picked files go through the same path as dropped ones. */
function pickFiles(editor: Editor) {
  const input = document.createElement("input")
  input.type = "file"
  input.multiple = true
  input.accept = [...DOCUMENT_ACCEPT, ...IMAGE_ACCEPT].join(",")
  input.onchange = () => {
    const files = [...(input.files ?? [])]
    if (files.length)
      void editor.putExternalContent({
        type: "files",
        files,
        point: editor.getViewportPageBounds().center,
      })
  }
  input.click()
}

export default definePlugin({
  id: "media-import",
  name: "Media import",
  version: "0.2.0",
  description:
    "Images and video, plus documents: PDFs and Word files as compact cards you page through, spreadsheets and CSV as tables. Files are kept inside the board.",
  category: "media",
  icon: Image01Icon,
  ai: mediaImportAi,
  stage: "preview",
  shapeUtils: [DocShapeUtil, SheetShapeUtil],
  fileImporters: [
    {
      id: "documents",
      order: 10,
      accept: DOCUMENT_ACCEPT,
      accepts: (file) => documentKind(file) !== null,
      import: async (ctx, files, point) => {
        // A points list dropped while connected can become live values instead.
        if (await offerPointsList(ctx, files, point)) return
        await importDocuments(ctx.editor, files, point)
      },
    },
  ],
  textImporters: [tablePaste],
  inspectorSections: [
    {
      id: "sheet-points",
      tab: "design",
      title: "Live points",
      order: 16,
      when: hasPointsListSelected,
      component: SheetPointsSection,
    },
  ],
  toolbar: [
    {
      id: "insert-media",
      group: "insert",
      order: 20,
      label: "Insert image or video",
      icon: Image01Icon,
      onSelect: ({ runAction }) => runAction("insert-media"),
    },
    {
      id: "add-documents",
      group: "insert",
      order: 19,
      label: "Add documents (PDF, Word, Excel, CSV, images)",
      icon: FileUploadIcon,
      onSelect: ({ editor }) => pickFiles(editor),
      pageKinds: ["documents"],
    },
  ],
  menuItems: [
    {
      id: "insert-documents",
      menu: "insert",
      group: "files",
      order: 900,
      label: "Documents…",
      onSelect: ({ editor }) => pickFiles(editor),
    },
  ],
})
