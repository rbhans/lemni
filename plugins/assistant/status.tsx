"use client"

import { useEditor, useValue } from "tldraw"

import { shell } from "@/sdk"

import { aiTouched } from "./state"

/** A brief outline around shapes the AI just made or changed. */
export function TouchedLayer() {
  const editor = useEditor()
  const presenting = useValue(shell.presenting)
  const boxes = useValue(
    "ai touched boxes",
    () => {
      const touched = aiTouched.get()
      const pageId = editor.getCurrentPageId()
      return Object.keys(touched).flatMap((id) => {
        const shape = editor.getShape(id as never)
        if (!shape || editor.getAncestorPageId(shape) !== pageId) return []
        const bounds = editor.getShapePageBounds(shape)
        return bounds
          ? [{ id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }]
          : []
      })
    },
    [editor]
  )
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  if (presenting || !boxes.length) return null
  const pad = 6 / zoom
  return (
    <>
      {boxes.map((box) => (
        <div
          key={box.id}
          aria-hidden
          className="pointer-events-none absolute animate-in rounded-md fade-in"
          style={{
            left: box.x - pad,
            top: box.y - pad,
            width: box.w + pad * 2,
            height: box.h + pad * 2,
            border: `${2 / zoom}px solid var(--primary)`,
            boxShadow: `0 0 ${12 / zoom}px color-mix(in oklab, var(--primary) 45%, transparent)`,
            borderRadius: 6 / zoom,
            zIndex: editor.options.maxShapesPerPage * 4,
          }}
        />
      ))}
    </>
  )
}
