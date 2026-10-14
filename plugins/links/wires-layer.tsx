"use client"

import { useState } from "react"
import { useEditor, useValue, type Box } from "tldraw"

import { getLinks, selectedLink } from "@/studio/links/links"
import { endKey } from "@/studio/links/model"
import { currentPageKind } from "@/studio/pages/page-categories"
import { studioState } from "@/studio/state"

import { isNodeShape, wireDrag } from "./wire-sheet"

interface Wire {
  id: string
  comment: string
  path: string
  mid: { x: number; y: number }
}

/** A smooth wire from one box's side to the other's (a loop when they share a column). */
function wirePath(a: Box, b: Box) {
  const left = a.midX <= b.midX ? a : b
  const right = left === a ? b : a
  const sameColumn = Math.abs(a.minX - b.minX) < 1
  const start = { x: left.maxX, y: left.midY }
  const end = sameColumn
    ? { x: right.maxX, y: right.midY }
    : { x: right.minX, y: right.midY }
  const reach = sameColumn ? 60 : Math.max(40, (end.x - start.x) / 2)
  const c1 = { x: start.x + reach, y: start.y }
  const c2 = { x: sameColumn ? end.x + reach : end.x - reach, y: end.y }
  return {
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    mid: {
      x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
      y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
    },
  }
}

/** Wires between wire sheet boxes, drawn under the boxes in page space. */
export function WiresLayer() {
  const editor = useEditor()
  const onSheet = useValue(
    "on wire sheet",
    () => currentPageKind(editor) === "wiresheet",
    [editor]
  )
  const wires = useValue(
    "wires",
    () => {
      if (currentPageKind(editor) !== "wiresheet") return []
      const boxes = new Map<string, Box>()
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id)
        if (!isNodeShape(shape)) continue
        const bounds = editor.getShapePageBounds(id)
        if (bounds) boxes.set(endKey(shape.props.end), bounds)
      }
      return getLinks(editor).flatMap<Wire>((link) => {
        const a = boxes.get(endKey(link.a))
        const b = boxes.get(endKey(link.b))
        if (!a || !b) return []
        return [{ id: link.id, comment: link.comment, ...wirePath(a, b) }]
      })
    },
    [editor]
  )
  const drag = useValue(wireDrag)
  const dragFrom = useValue(
    "wire drag start",
    () => {
      const from = wireDrag.get()?.from
      if (!from) return null
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id)
        if (isNodeShape(shape) && endKey(shape.props.end) === from)
          return editor.getShapePageBounds(id) ?? null
      }
      return null
    },
    [editor]
  )
  const selected = useValue(selectedLink)
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  const presenting = useValue(studioState.presenting)
  const [hover, setHover] = useState<string | null>(null)
  if (!onSheet || presenting) return null
  const hovered = wires.find((wire) => wire.id === hover)

  return (
    <>
      <svg
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        // Under the boxes (shapes stack well above this).
        style={{ zIndex: 1 }}
      >
        {wires.map((wire) => {
          const active = wire.id === selected || wire.id === hover
          return (
            <g key={wire.id}>
              <path
                d={wire.path}
                fill="none"
                className={
                  active ? "stroke-primary" : "stroke-muted-foreground/60"
                }
                strokeWidth={active ? 2.5 : 1.5}
              />
              {/* A wider invisible stroke makes the wire easy to hover and click. */}
              <path
                d={wire.path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerEnter={() => setHover(wire.id)}
                onPointerLeave={() =>
                  setHover((current) => (current === wire.id ? null : current))
                }
                onPointerDown={(event) => {
                  event.stopPropagation()
                  editor.selectNone()
                  selectedLink.set(wire.id)
                }}
              />
            </g>
          )
        })}
        {drag && dragFrom ? (
          <path
            d={`M ${dragFrom.maxX} ${dragFrom.midY} L ${drag.to.x} ${drag.to.y}`}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        ) : null}
      </svg>
      {hovered?.comment ? (
        <div
          // The canvas layer has no width, so size to the text; keep it the same
          // size on screen whatever the zoom.
          className="pointer-events-none absolute w-max max-w-72 rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md"
          style={{
            left: hovered.mid.x,
            top: hovered.mid.y,
            transform: `translate(-50%, calc(-100% - 8px)) scale(${1 / zoom})`,
            transformOrigin: "50% 100%",
            zIndex: editor.options.maxShapesPerPage * 4,
          }}
        >
          {hovered.comment}
        </div>
      ) : null}
    </>
  )
}
