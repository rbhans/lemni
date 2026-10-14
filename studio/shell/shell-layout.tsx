"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useValue } from "tldraw"

import { studioState } from "../state"

export interface ShellSlots {
  top: HTMLElement
  rail: HTMLElement
  left: HTMLElement
  right: HTMLElement
  status: HTMLElement
}

/**
 * Docked layout: top bar, panel rail, left dock, canvas, right dock and status
 * bar. The canvas owns the editor; chrome is portaled into the other slots.
 */
export function ShellLayout({
  children,
}: {
  children: (slots: ShellSlots | null) => ReactNode
}) {
  const [top, setTop] = useState<HTMLDivElement | null>(null)
  const [rail, setRail] = useState<HTMLDivElement | null>(null)
  const [left, setLeft] = useState<HTMLDivElement | null>(null)
  const [right, setRight] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<HTMLDivElement | null>(null)

  const presenting = useValue(studioState.presenting)
  const slots = useMemo(
    () =>
      top && rail && left && right && status
        ? { top, rail, left, right, status }
        : null,
    [top, rail, left, right, status]
  )

  return (
    <div
      className="grid h-svh w-full overflow-hidden bg-background text-foreground"
      style={{
        // Present mode keeps the top bar and gives the canvas everything else.
        gridTemplateColumns: presenting
          ? "0px 0px minmax(0, 1fr) 0px"
          : "48px auto minmax(0, 1fr) auto",
        gridTemplateRows: presenting
          ? "44px minmax(0, 1fr) 0px"
          : "44px minmax(0, 1fr) 28px",
        gridTemplateAreas: `"top top top top" "rail left canvas right" "status status status status"`,
      }}
    >
      <div ref={setTop} className="min-w-0" style={{ gridArea: "top" }} />
      <div
        ref={setRail}
        className="min-h-0 overflow-hidden"
        style={{ gridArea: "rail" }}
      />
      <div
        ref={setLeft}
        className="min-h-0 overflow-hidden"
        style={{ gridArea: "left" }}
      />
      {/* `isolate` keeps tldraw's high z-indexes from rising above menus and dialogs. */}
      <div
        className="relative isolate min-h-0 min-w-0 overflow-hidden"
        style={{ gridArea: "canvas" }}
      >
        {children(slots)}
      </div>
      <div
        ref={setRight}
        className="min-h-0 overflow-hidden"
        style={{ gridArea: "right" }}
      />
      <div
        ref={setStatus}
        className="min-w-0 overflow-hidden"
        style={{ gridArea: "status" }}
      />
    </div>
  )
}
