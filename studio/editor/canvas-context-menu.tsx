"use client"

import type { ReactNode } from "react"
import { useActions, useEditor, useMenuIsOpen, useValue } from "tldraw"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { formatKbd } from "../lib/kbd"
import { usePluginRuntime } from "../plugins/runtime"
import { useStudioContext } from "../studio-context"

type Entry = {
  action: string
  label: string
  needs?: "selection" | "multiple" | "group"
}

const GROUPS: Entry[][] = [
  [
    { action: "undo", label: "Undo" },
    { action: "redo", label: "Redo" },
  ],
  [
    { action: "cut", label: "Cut", needs: "selection" },
    { action: "copy", label: "Copy", needs: "selection" },
    { action: "paste", label: "Paste" },
    { action: "duplicate", label: "Duplicate", needs: "selection" },
  ],
  [
    { action: "group", label: "Group", needs: "multiple" },
    { action: "ungroup", label: "Ungroup", needs: "group" },
    { action: "toggle-lock", label: "Lock / unlock", needs: "selection" },
  ],
  [
    { action: "bring-to-front", label: "Bring to front", needs: "selection" },
    { action: "send-to-back", label: "Send to back", needs: "selection" },
  ],
  [
    {
      action: "zoom-to-selection",
      label: "Zoom to selection",
      needs: "selection",
    },
    { action: "select-all", label: "Select all" },
  ],
  [{ action: "delete", label: "Delete", needs: "selection" }],
]

/** Right-click menu for the canvas, built on tldraw's action registry. */
export function CanvasContextMenu({ children }: { children: ReactNode }) {
  const editor = useEditor()
  const actions = useActions()
  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()
  // Plugin items (Link mark, …), grouped; read while the menu is open.
  const extra = useValue(
    "context menu extras",
    () => {
      const groups = new Map<
        string,
        { id: string; label: string; disabled: boolean; run(): void }[]
      >()
      for (const item of contributions.contextMenuItems) {
        if (item.when && !item.when(editor)) continue
        const list = groups.get(item.group) ?? []
        list.push({
          id: item.id,
          label:
            typeof item.label === "function" ? item.label(editor) : item.label,
          disabled: item.disabled?.(editor) ?? false,
          run: () => item.onSelect(ctx),
        })
        groups.set(item.group, list)
      }
      return [...groups.values()]
    },
    [editor, contributions.contextMenuItems, ctx]
  )
  const selection = useValue(
    "context selection",
    () => {
      const shapes = editor.getSelectedShapes()
      return {
        count: shapes.length,
        hasGroup: shapes.some((shape) => shape.type === "group"),
      }
    },
    [editor]
  )

  // Registering the menu tells tldraw a menu is open (it pauses canvas input).
  // On open, right-clicking an unselected shape selects it first, like tldraw's own menu.
  const [open, onOpenChange] = useMenuIsOpen("context menu", (isOpen) => {
    if (!isOpen) return
    const point = editor.inputs.getCurrentPagePoint()
    const hit = editor.getShapeAtPoint(point, { hitInside: true, margin: 2 })
    if (!hit) return
    const target = editor.getOutermostSelectableShape(hit)
    if (
      !editor.getSelectedShapeIds().includes(target.id) &&
      !editor.isShapeOrAncestorLocked(target)
    ) {
      editor.select(target.id)
    }
  })

  const isEnabled = (entry: Entry) => {
    if (entry.needs === "selection") return selection.count > 0
    if (entry.needs === "multiple") return selection.count > 1
    if (entry.needs === "group") return selection.hasGroup
    return true
  }

  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      <ContextMenuTrigger className="absolute inset-0">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {extra.map((group, index) => (
          <div key={`extra-${index}`} className="contents">
            {group.map((item) => (
              <ContextMenuItem
                key={item.id}
                disabled={item.disabled}
                onClick={() => {
                  item.run()
                  editor.focus()
                }}
              >
                <span className="truncate">{item.label}</span>
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
          </div>
        ))}
        {GROUPS.map((group, index) => (
          <div key={index} className="contents">
            {index > 0 ? <ContextMenuSeparator /> : null}
            {group.map((entry) => {
              const action = actions[entry.action]
              if (!action) return null
              return (
                <ContextMenuItem
                  key={entry.action}
                  disabled={!isEnabled(entry)}
                  variant={
                    entry.action === "delete" ? "destructive" : "default"
                  }
                  onClick={() => {
                    void action.onSelect("context-menu")
                    editor.focus()
                  }}
                >
                  {entry.label}
                  {action.kbd ? (
                    <ContextMenuShortcut>
                      {formatKbd(action.kbd).join("")}
                    </ContextMenuShortcut>
                  ) : null}
                </ContextMenuItem>
              )
            })}
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
