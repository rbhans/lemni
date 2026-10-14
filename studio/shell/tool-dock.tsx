"use client"

import { Fragment, useState } from "react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import {
  useEditor,
  useIsToolSelected,
  useTools,
  useValue,
  type TLUiToolItem,
} from "tldraw"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { formatKbd } from "../lib/kbd"
import { currentPageKind } from "../pages/page-categories"
import { usePluginRuntime } from "../plugins/runtime"
import type { ToolbarContribution, ToolItem } from "../plugins/types"
import { useStudioContext } from "../studio-context"
import { studioState } from "../state"
import { Icon } from "./icon"
import { Tip } from "./tip"

const GROUP_ORDER: ToolbarContribution["group"][] = [
  "navigate",
  "draw",
  "insert",
  "present",
]

const toolButton =
  "flex size-[34px] items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:opacity-40"
const activeButton =
  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"

/** Floating tool dock over the canvas (the tldraw-style bottom toolbar). */
export function ToolDock() {
  const editor = useEditor()
  const { contributions } = usePluginRuntime()
  const presenting = useValue(studioState.presenting)
  const kind = useValue("page kind", () => currentPageKind(editor), [editor])
  // Tools show on UI and Documents pages unless they say otherwise.
  const groups = GROUP_ORDER.map((group) =>
    contributions.toolbar.filter(
      (item) =>
        item.group === group &&
        (item.pageKinds ?? ["ui", "documents"]).includes(kind)
    )
  ).filter((items) => items.length > 0)
  if (!groups.length || presenting) return null

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className="pointer-events-auto absolute bottom-4 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/10"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {groups.map((items, index) => (
        <Fragment key={items[0].group}>
          {index > 0 ? (
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          ) : null}
          {items.map((item) =>
            item.variants?.length ? (
              <VariantTool key={item.id} item={item} />
            ) : (
              <DockTool key={item.id} item={item} />
            )
          )}
        </Fragment>
      ))}
    </div>
  )
}

function useToolItem(item: ToolItem) {
  const tools = useTools()
  const ctx = useStudioContext()
  const tool: TLUiToolItem | undefined = item.tool
    ? tools[item.tool]
    : undefined
  const selected = useIsToolSelected(tool)
  const available = !item.tool || Boolean(tool)
  const select = () => {
    if (item.onSelect) item.onSelect(ctx)
    else if (item.tool) ctx.selectTool(item.tool)
  }
  return { selected, available, select, kbd: item.kbd ?? tool?.kbd }
}

function DockTool({ item }: { item: ToolItem }) {
  const { selected, available, select, kbd } = useToolItem(item)
  if (!available) return null
  return (
    <Tip label={item.label} kbd={kbd}>
      <button
        type="button"
        aria-label={item.label}
        aria-pressed={selected}
        onClick={select}
        className={cn(toolButton, selected && activeButton)}
      >
        <Icon icon={item.icon} className="size-[18px]" />
      </button>
    </Tip>
  )
}

/** A tool with variants (e.g. shapes): the button repeats the last variant used. */
function VariantTool({ item }: { item: ToolbarContribution }) {
  const variants = item.variants ?? []
  const [lastId, setLastId] = useState(variants[0]?.id)
  const current =
    variants.find((variant) => variant.id === lastId) ?? variants[0]
  const tools = useTools()
  const ctx = useStudioContext()
  const { selected, select } = useToolItem(current)
  const anySelected = useAnyVariantSelected(variants)

  return (
    <div
      className={cn(
        "flex items-center rounded-lg",
        (selected || anySelected) && "bg-primary/15"
      )}
    >
      <Tip
        label={current.label}
        kbd={
          current.kbd ?? (current.tool ? tools[current.tool]?.kbd : undefined)
        }
      >
        <button
          type="button"
          aria-label={current.label}
          aria-pressed={selected}
          onClick={select}
          className={cn(toolButton, "rounded-r-none", selected && activeButton)}
        >
          <Icon icon={current.icon} className="size-[18px]" />
        </button>
      </Tip>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`${item.label} options`}
              className="flex h-[34px] w-4 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          }
        >
          <Icon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="center"
          sideOffset={10}
          className="w-48"
        >
          {variants.map((variant) => {
            if (variant.tool && !tools[variant.tool]) return null
            const keys = formatKbd(
              variant.kbd ??
                (variant.tool ? tools[variant.tool]?.kbd : undefined)
            )
            return (
              <DropdownMenuItem
                key={variant.id}
                onClick={() => {
                  setLastId(variant.id)
                  if (variant.onSelect) variant.onSelect(ctx)
                  else if (variant.tool) ctx.selectTool(variant.tool)
                }}
              >
                <Icon icon={variant.icon} />
                {variant.label}
                {keys.length ? (
                  <DropdownMenuShortcut>{keys.join("")}</DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** True while any variant's underlying tldraw tool is active (geo variants share "geo"). */
function useAnyVariantSelected(variants: ToolItem[]) {
  const tools = useTools()
  const { editor } = useStudioContext()
  const toolIds = variants
    .map((variant) => (variant.tool ? tools[variant.tool] : undefined))
    .filter((tool): tool is TLUiToolItem => Boolean(tool))
    .map((tool) => (tool.meta?.geo ? "geo" : tool.id))
  return useValue(
    "variant group selected",
    () => toolIds.includes(editor.getCurrentToolId()),
    [editor, toolIds.join()]
  )
}
