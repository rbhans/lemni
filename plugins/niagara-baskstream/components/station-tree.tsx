"use client"

import { useEffect } from "react"
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { useEditor, useValue } from "tldraw"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import {
  endLabel,
  linkMark,
  linkToMark,
  markForLink,
} from "@/studio/links/links"
import { sameEnd, type LinkEnd } from "@/studio/links/model"
import { usePluginRuntime } from "@/studio/plugins/runtime"
import { Icon } from "@/studio/shell/icon"

import {
  FOLDER_DRAG_TYPE,
  POINT_DRAG_TYPE,
  type FolderDragData,
  type PointDragData,
} from "@/studio/data/live-points"

import type { StationNode } from "../shared"
import { currentSourceId } from "../client/store"
import {
  branches,
  expanded,
  loadBranch,
  selectedOrd,
  toggleBranch,
} from "../client/tree-state"
import { kindOfNode, LiveValueText, NodeIcon } from "./bits"

export function StationTree() {
  const root = useValue("root branch", () => branches.get()["slot:/"], [])

  useEffect(() => {
    void loadBranch("slot:/")
  }, [])

  if (root?.error)
    return <p className="px-4 py-6 text-xs text-destructive">{root.error}</p>
  if (!root?.children)
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        Loading station…
      </p>
    )

  return (
    <ul role="tree" aria-label="Station" className="flex flex-col py-1">
      {root.children.map((node) => (
        <TreeRow key={node.ord} node={node} depth={0} />
      ))}
    </ul>
  )
}

function TreeRow({ node, depth }: { node: StationNode; depth: number }) {
  const isOpen = useValue(
    `open ${node.ord}`,
    () => Boolean(expanded.get()[node.ord]),
    [node.ord]
  )
  const branch = useValue(
    `branch ${node.ord}`,
    () => branches.get()[node.ord],
    [node.ord]
  )
  const isSelected = useValue(
    `selected ${node.ord}`,
    () => selectedOrd.get() === node.ord,
    [node.ord]
  )
  const isPoint = node.kind === "point"

  return (
    <li
      role="treeitem"
      aria-expanded={node.hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                "group flex h-[26px] items-center gap-1.5 pr-2.5 text-xs",
                isSelected ? "bg-primary/20" : "hover:bg-muted"
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
            />
          }
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => toggleBranch(node.ord)}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
              !node.hasChildren && "invisible"
            )}
          >
            <Icon
              icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
              className="size-3"
              strokeWidth={2}
            />
          </button>
          <button
            type="button"
            // Points drag one point; folders (equipment, devices) drag everything inside.
            draggable={isPoint || node.hasChildren}
            onDragStart={(event) => {
              const source = currentSourceId()
              if (!source) return event.preventDefault()
              if (isPoint) {
                const data: PointDragData = {
                  source,
                  point: node.ord,
                  label: node.name,
                  kind: kindOfNode(node),
                }
                event.dataTransfer.setData(
                  POINT_DRAG_TYPE,
                  JSON.stringify(data)
                )
              } else {
                const data: FolderDragData = {
                  source,
                  folder: node.ord,
                  label: node.display || node.name,
                }
                event.dataTransfer.setData(
                  FOLDER_DRAG_TYPE,
                  JSON.stringify(data)
                )
              }
              event.dataTransfer.effectAllowed = "copyLink"
            }}
            onClick={() =>
              isPoint ? selectedOrd.set(node.ord) : toggleBranch(node.ord)
            }
            onDoubleClick={() => !isPoint && toggleBranch(node.ord)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={node.ord}
          >
            <NodeIcon node={node} />
            <span className={cn("truncate", isPoint ? "" : "font-medium")}>
              {isPoint ? node.name : node.display}
            </span>
          </button>
          {isPoint ? (
            <LiveValueText ord={node.ord} className="shrink-0" />
          ) : null}
        </ContextMenuTrigger>
        <RowMenu node={node} />
      </ContextMenu>
      {isOpen && node.hasChildren ? (
        branch?.children ? (
          <ul role="group">
            {branch.children.map((child) => (
              <TreeRow key={child.ord} node={child} depth={depth + 1} />
            ))}
          </ul>
        ) : (
          <p
            className="py-1 text-[11px] text-muted-foreground"
            style={{ paddingLeft: 30 + depth * 12 }}
          >
            {branch?.error ?? "Loading…"}
          </p>
        )
      ) : null}
    </li>
  )
}

/** Right-click a point or folder: Link mark it, or link it to what's marked. */
function RowMenu({ node }: { node: StationNode }) {
  const editor = useEditor()
  const { enabled } = usePluginRuntime()
  const mark = useValue(linkMark)
  const markLabel = useValue(
    "mark label",
    () => {
      const m = linkMark.get()
      return m ? endLabel(editor, m) : ""
    },
    [editor]
  )
  const source = currentSourceId()
  if (!enabled.has("links") || !source) return null
  const end: LinkEnd = {
    kind: "point",
    source,
    point: node.ord,
    label: node.kind === "point" ? node.name : node.display || node.name,
  }
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuItem onClick={() => markForLink(end)}>
        Link mark
      </ContextMenuItem>
      {mark && !sameEnd(mark, end) ? (
        <ContextMenuItem onClick={() => linkToMark(editor, end)}>
          <span className="truncate">Link to {markLabel}</span>
        </ContextMenuItem>
      ) : null}
    </ContextMenuContent>
  )
}
