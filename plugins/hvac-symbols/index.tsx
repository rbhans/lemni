"use client"

import { FanIcon } from "@hugeicons/core-free-icons"
import { createShapeId, useMaybeEditor, useValue } from "tldraw"

import type {
  BoardPlugin,
  LibraryCollectionContribution,
  LibraryItem,
} from "@/studio/plugins/types"

import {
  CATEGORIES,
  DEFAULT_STATE,
  defaultSize,
  PIECES,
  searchTermsFor,
  stretchLength,
  symbolClasses,
  symbolMarkup,
  symbolVars,
  viewBoxFor,
  type SymbolPiece,
} from "./library"
import { hvacAi } from "./ai-tools"
import { hasSymbolSelected, SymbolSection } from "./symbol-section"
import { SYMBOL_TYPE, SymbolShapeUtil } from "./symbol-shape"
import { useSymbolStyles } from "./symbol-styles"

function SymbolPreview({ piece }: { piece: SymbolPiece }) {
  const editor = useMaybeEditor()
  const dark = useValue(
    "library dark",
    () => editor?.getColorMode() === "dark",
    [editor]
  )
  useSymbolStyles(piece)
  const { w, h } = defaultSize(piece)
  const length = stretchLength(piece, w, h)
  return (
    <svg
      viewBox={viewBoxFor(piece, length)}
      className={`${symbolClasses(piece, DEFAULT_STATE, { dark })} size-full`}
      style={symbolVars(piece, DEFAULT_STATE)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: symbolMarkup(piece, { length }) }}
    />
  )
}

function toItem(piece: SymbolPiece): LibraryItem {
  return {
    id: piece.id,
    label: piece.title,
    keywords: searchTermsFor(piece),
    preview: <SymbolPreview piece={piece} />,
    insert({ editor }, point) {
      const { w, h } = defaultSize(piece)
      const id = createShapeId()
      editor.markHistoryStoppingPoint("insert symbol")
      editor.createShape({
        id,
        type: SYMBOL_TYPE,
        x: point.x - w / 2,
        y: point.y - h / 2,
        props: { symbol: piece.id, w, h },
      })
      editor.select(id)
    },
  }
}

const tab = { id: "hvac", label: "HVAC", order: 20 }

const collections: LibraryCollectionContribution[] = CATEGORIES.map(
  (category, index) => ({
    id: `hvac-${category.id}`,
    tab,
    title: category.title,
    order: (index + 1) * 10,
    items: PIECES.filter((piece) => piece.category === category.id).map(toItem),
  })
)

export const hvacSymbols: BoardPlugin = {
  id: "hvac-symbols",
  name: "HVAC & BAS symbols",
  version: "0.2.0",
  description:
    "The base control-drawing library: air side, water side and sensors, with live states (running, flow, damper position, level).",
  category: "libraries",
  icon: FanIcon,
  stage: "preview",
  shapeUtils: [SymbolShapeUtil],
  libraryCollections: collections,
  ai: hvacAi,
  inspectorSections: [
    {
      id: "symbol",
      tab: "design",
      title: "Symbol",
      order: 15,
      when: hasSymbolSelected,
      component: SymbolSection,
    },
  ],
}
