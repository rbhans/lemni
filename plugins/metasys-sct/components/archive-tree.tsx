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
  FOLDER_DRAG_TYPE,
  POINT_DRAG_TYPE,
  type FolderDragData,
  type PointDragData,
} from "@/studio/data/live-points"
import {
  endLabel,
  linkMark,
  linkToMark,
  markForLink,
} from "@/studio/links/links"
import { sameEnd, type LinkEnd } from "@/studio/links/model"
import { usePluginRuntime } from "@/studio/plugins/runtime"
import { Icon } from "@/studio/shell/icon"

import type { SctNode } from "../shared"
import { currentSourceId, folderRef } from "../client/store"
import {
  branches,
  expanded,
  loadBranch,
  ROOT,
  selectedFqr,
  toggleBranch,
} from "../client/tree-state"
import { isPoint, NodeIcon, StoredValueText } from "./bits"

/** The archive's network view: site, engines, trunks and controllers, then points. */
export function ArchiveTree() {
  const root = useValue("sct root", () => branches.get()[ROOT], [])

  useEffect(() => {
    void loadBranch(ROOT)
  }, [])

  if (root?.error)
    return <p className="px-4 py-6 text-xs text-destructive">{root.error}</p>
  if (!root?.children)
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        Loading archive…
      </p>
    )
  if (!root.children.length)
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        This archive is empty.
      </p>
    )

  return (
    <ul role="tree" aria-label="Network" className="flex flex-col py-1">
      {root.children.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} />
      ))}
    </ul>
  )
}

function TreeRow({ node, depth }: { node: SctNode; depth: number }) {
  const key = String(node.id)
  const isOpen = useValue(
    `sct open ${key}`,
    () => Boolean(expanded.get()[key]),
    [key]
  )
  const branch = useValue(`sct branch ${key}`, () => branches.get()[key], [key])
  const isSelected = useValue(
    `sct selected ${key}`,
    () => selectedFqr.get() === node.fqr,
    [node.fqr]
  )
  const point = isPoint(node)

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
            onClick={() => toggleBranch(key)}
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
            // Points drag one point; engines, trunks and controllers drag their points.
            draggable={point || node.hasChildren}
            onDragStart={(event) => {
              const source = currentSourceId()
              if (!source) return event.preventDefault()
              if (point) {
                const data: PointDragData = {
                  source,
                  point: node.fqr,
                  label: node.name,
                  kind: node.kind,
                }
                event.dataTransfer.setData(
                  POINT_DRAG_TYPE,
                  JSON.stringify(data)
                )
              } else {
                const data: FolderDragData = {
                  source,
                  folder: folderRef(node),
                  label: node.name,
                }
                event.dataTransfer.setData(
                  FOLDER_DRAG_TYPE,
                  JSON.stringify(data)
                )
              }
              event.dataTransfer.effectAllowed = "copyLink"
            }}
            onClick={() =>
              point || !node.hasChildren
                ? selectedFqr.set(node.fqr)
                : toggleBranch(key)
            }
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={`${node.fqr}\n${node.definition}`}
          >
            <NodeIcon node={node} />
            <span className={cn("truncate", point ? "" : "font-medium")}>
              {node.name}
            </span>
            {node.pointType ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {node.pointType}
              </span>
            ) : null}
          </button>
          {point ? (
            <StoredValueText fqr={node.fqr} className="shrink-0" />
          ) : null}
        </ContextMenuTrigger>
        <RowMenu node={node} />
      </ContextMenu>
      {isOpen && node.hasChildren ? (
        branch?.children ? (
          branch.children.length ? (
            <ul role="group">
              {branch.children.map((child) => (
                <TreeRow key={child.id} node={child} depth={depth + 1} />
              ))}
            </ul>
          ) : (
            <p
              className="py-1 text-[11px] text-muted-foreground"
              style={{ paddingLeft: 30 + depth * 12 }}
            >
              Nothing in the network view.
            </p>
          )
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

/** Right-click a point: Link mark it, or link it to what's marked. */
function RowMenu({ node }: { node: SctNode }) {
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
  if (!enabled.has("links") || !source || !node.fqr) return null
  const end: LinkEnd = {
    kind: "point",
    source,
    point: node.fqr,
    label: node.name,
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
