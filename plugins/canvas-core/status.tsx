"use client"

import {
  Add01Icon,
  GridIcon,
  Magnet01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"
import { useActions, useEditor, useValue } from "tldraw"

import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"
import { Tip } from "@/studio/shell/tip"

export function PageStatus() {
  const editor = useEditor()
  const info = useValue(
    "page status",
    () => {
      const pages = editor.getPages()
      const index = pages.findIndex(
        (page) => page.id === editor.getCurrentPageId()
      )
      return {
        name: pages[index]?.name ?? "",
        index: index + 1,
        total: pages.length,
      }
    },
    [editor]
  )
  return (
    <span>
      {info.name} · Page {info.index} of {info.total}
    </span>
  )
}

export function SelectionStatus() {
  const editor = useEditor()
  const count = useValue(
    "selected count",
    () => editor.getSelectedShapeIds().length,
    [editor]
  )
  return <span>{count ? `${count} selected` : "Nothing selected"}</span>
}

export function CursorStatus() {
  const editor = useEditor()
  const point = useValue(
    "cursor",
    () => {
      const p = editor.inputs.getCurrentPagePoint()
      return { x: Math.round(p.x), y: Math.round(p.y) }
    },
    [editor]
  )
  return (
    <span className="font-mono">
      X {point.x} · Y {point.y}
    </span>
  )
}

const statusButton =
  "flex size-5.5 items-center justify-center rounded-[5px] text-foreground/70 hover:bg-muted hover:text-foreground"

export function GuidesStatus() {
  const editor = useEditor()
  const actions = useActions()
  const grid = useValue("grid", () => editor.getInstanceState().isGridMode, [
    editor,
  ])
  const snap = useValue("snap", () => editor.user.getIsSnapMode(), [editor])
  return (
    <span className="flex items-center gap-1">
      <Tip label="Show grid" kbd={actions["toggle-grid"]?.kbd}>
        <button
          type="button"
          aria-label="Show grid"
          aria-pressed={grid}
          onClick={() => void actions["toggle-grid"]?.onSelect("menu")}
          className={cn(statusButton, grid && "bg-muted text-foreground")}
        >
          <Icon icon={GridIcon} className="size-3.5" />
        </button>
      </Tip>
      <Tip label="Always snap" kbd={actions["toggle-snap-mode"]?.kbd}>
        <button
          type="button"
          aria-label="Always snap"
          aria-pressed={snap}
          onClick={() => void actions["toggle-snap-mode"]?.onSelect("menu")}
          className={cn(statusButton, snap && "bg-muted text-foreground")}
        >
          <Icon icon={Magnet01Icon} className="size-3.5" />
        </button>
      </Tip>
    </span>
  )
}

export function ZoomStatus() {
  const editor = useEditor()
  const actions = useActions()
  const zoom = useValue("zoom", () => Math.round(editor.getZoomLevel() * 100), [
    editor,
  ])
  return (
    <span className="flex items-center gap-0.5">
      <Tip label="Zoom out" kbd={actions["zoom-out"]?.kbd}>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => void actions["zoom-out"]?.onSelect("zoom-menu")}
          className={statusButton}
        >
          <Icon icon={MinusSignIcon} className="size-3.5" />
        </button>
      </Tip>
      <Tip label="Reset zoom" kbd={actions["zoom-to-100"]?.kbd}>
        <button
          type="button"
          onClick={() => void actions["zoom-to-100"]?.onSelect("zoom-menu")}
          className="w-11 rounded-[5px] text-center font-mono text-foreground hover:bg-muted"
        >
          {zoom}%
        </button>
      </Tip>
      <Tip label="Zoom in" kbd={actions["zoom-in"]?.kbd}>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => void actions["zoom-in"]?.onSelect("zoom-menu")}
          className={statusButton}
        >
          <Icon icon={Add01Icon} className="size-3.5" />
        </button>
      </Tip>
    </span>
  )
}
