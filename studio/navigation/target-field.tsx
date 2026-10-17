"use client"

import { useEffect, useState } from "react"
import {
  Cancel01Icon,
  File01Icon,
  FrameIcon,
  Globe02Icon,
  Navigation03Icon,
  ServerStack01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import {
  useEditor,
  useValue,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { useDataSource } from "../data/live-points"
import { PointField } from "../data/point-field"
import { customShapeName, shapeDisplayName } from "../lib/shape-names"
import { Icon } from "../shell/icon"
import {
  endTargetPick,
  startTargetPick,
  targetAt,
  targetLabel,
  targetPick,
} from "./navigate"
import {
  parseTarget,
  safeUrl,
  serializeTarget,
  type NavTarget,
} from "./targets"

/** Things worth jumping to, per page: frames, documents and anything named. */
function useTargetOptions(editor: Editor) {
  return useValue(
    "navigation targets",
    () =>
      editor.getPages().map((page) => {
        const shapes = [...editor.getPageShapeIds(page.id)]
          .map((id) => editor.getShape(id))
          .filter((shape): shape is TLShape => Boolean(shape))
          .filter(
            (shape) =>
              shape.type === "frame" ||
              typeof (shape.props as { pageCount?: unknown }).pageCount ===
                "number" ||
              customShapeName(shape) !== null
          )
          .map((shape) => ({
            id: shape.id,
            label: shapeDisplayName(shape),
            isDoc:
              typeof (shape.props as { pageCount?: unknown }).pageCount ===
              "number",
          }))
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
          )
        return { id: page.id, name: page.name, shapes }
      }),
    [editor]
  )
}

/**
 * Chooses where a click goes: a page, a frame, a document (or one of its pages), any
 * named shape, a station point, or a web address, or pick it by clicking on the board.
 */
export function TargetField({
  value,
  onChange,
  pickLabel,
}: {
  value: string
  onChange(value: string): void
  /** Shown while picking on the board, e.g. "Go to for the Occupied button". */
  pickLabel: string
}) {
  const editor = useEditor()
  const target = parseTarget(value)
  const pages = useTargetOptions(editor)
  const label = useValue("target label", () => targetLabel(editor, target), [
    editor,
    value,
  ])
  // Typing an address or choosing a point needs a moment before it's a target.
  const [entry, setEntry] = useState<"url" | "point" | null>(null)
  const set = (next: NavTarget | null) => {
    setEntry(null)
    onChange(next ? serializeTarget(next) : "")
  }

  const docShape =
    target?.kind === "shape" || target?.kind === "docPage"
      ? editor.getShape(target.shapeId as TLShapeId)
      : undefined
  const pageCount = (docShape?.props as { pageCount?: unknown } | undefined)
    ?.pageCount
  const pointSource = useDataSource(
    target?.kind === "point" ? target.source : undefined
  )
  const icon =
    target?.kind === "url"
      ? Globe02Icon
      : target?.kind === "point"
        ? (pointSource?.icon ?? ServerStack01Icon)
        : target?.kind === "page"
          ? File01Icon
          : target
            ? FrameIcon
            : Navigation03Icon

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Go to"
                className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-left text-xs hover:bg-muted/40"
              />
            }
          >
            <Icon icon={icon} className="size-3.5 text-muted-foreground" />
            <span
              className={cn("truncate", !target && "text-muted-foreground")}
            >
              {target ? label : "Choose where it goes"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 min-w-56 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() =>
                startTargetPick(editor, pickLabel, (picked) => set(picked))
              }
            >
              <Icon icon={Target02Icon} />
              Pick on the board…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEntry("point")}>
              <Icon icon={ServerStack01Icon} />
              Station point…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEntry("url")}>
              <Icon icon={Globe02Icon} />
              Web address…
            </DropdownMenuItem>
            {pages.map((page) => (
              <DropdownMenuGroup key={page.id}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{page.name}</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => set({ kind: "page", pageId: page.id })}
                >
                  <Icon icon={File01Icon} />
                  The whole page
                </DropdownMenuItem>
                {page.shapes.map((shape) => (
                  <DropdownMenuItem
                    key={shape.id}
                    onClick={() => set({ kind: "shape", shapeId: shape.id })}
                  >
                    <Icon icon={shape.isDoc ? File01Icon : FrameIcon} />
                    <span className="truncate">{shape.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {target ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear"
            onClick={() => set(null)}
          >
            <Icon icon={Cancel01Icon} className="size-3" />
          </Button>
        ) : null}
      </div>

      {typeof pageCount === "number" && pageCount > 1 && docShape ? (
        <DocPageField
          page={target?.kind === "docPage" ? target.page : null}
          pageCount={pageCount}
          onChange={(page) =>
            set(
              page === null
                ? { kind: "shape", shapeId: docShape.id }
                : { kind: "docPage", shapeId: docShape.id, page }
            )
          }
        />
      ) : null}

      {entry === "url" || target?.kind === "url" ? (
        <UrlField
          value={target?.kind === "url" ? target.href : ""}
          autoFocus={entry === "url"}
          onCommit={(href) => set(href ? { kind: "url", href } : null)}
        />
      ) : null}

      {entry === "point" || target?.kind === "point" ? (
        <PointField
          compact
          value={
            target?.kind === "point"
              ? {
                  source: target.source,
                  point: target.point,
                  label: target.label,
                }
              : null
          }
          onChange={(ref) =>
            set({
              kind: "point",
              source: ref.source,
              point: ref.point,
              label: ref.label ?? ref.point.split("/").pop() ?? ref.point,
            })
          }
        />
      ) : null}
    </div>
  )
}

function DocPageField({
  page,
  pageCount,
  onChange,
}: {
  page: number | null
  pageCount: number
  onChange(page: number | null): void
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      Page
      <Input
        key={String(page)}
        inputMode="numeric"
        aria-label="Document page"
        className="h-7 w-16 font-mono text-xs"
        defaultValue={page === null ? "" : String(page)}
        placeholder="Any"
        onBlur={(event) => {
          const n = Number.parseInt(event.target.value, 10)
          const next =
            Number.isFinite(n) && n >= 1 ? Math.min(n, pageCount) : null
          if (next !== page) onChange(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      <span>of {pageCount}</span>
    </label>
  )
}

function UrlField({
  value,
  autoFocus,
  onCommit,
}: {
  value: string
  autoFocus: boolean
  onCommit(href: string | null): void
}) {
  const [bad, setBad] = useState(false)
  return (
    <Input
      key={value}
      autoFocus={autoFocus}
      aria-label="Web address"
      aria-invalid={bad}
      className="h-7 text-xs"
      defaultValue={value}
      placeholder="https://…"
      onBlur={(event) => {
        const text = event.target.value.trim()
        if (!text) return onCommit(null)
        const href = safeUrl(text)
        setBad(!href)
        if (href && href !== value) onCommit(href)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}

/**
 * While a target is being picked: a banner saying so, and the next click on the board
 * picks what's under it (switching pages in the top bar still works).
 */
export function TargetPickLayer() {
  const editor = useEditor()
  const pick = useValue(targetPick)

  useEffect(() => {
    if (!pick) return
    const container = editor.getContainer()
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const canvas = (event.target as Element | null)?.closest(".tl-canvas")
      if (!canvas) return
      event.preventDefault()
      event.stopPropagation()
      const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
      endTargetPick(editor, targetAt(editor, point))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") endTargetPick(editor, null)
    }
    container.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKeyDown, true)
    editor.setCursor({ type: "cross", rotation: 0 })
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKeyDown, true)
      editor.setCursor({ type: "default", rotation: 0 })
    }
  }, [editor, pick])

  if (!pick) return null
  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-[400] flex max-w-[min(560px,90%)] -translate-x-1/2 items-center gap-2 rounded-full border bg-popover py-1 pr-1 pl-3 text-xs text-popover-foreground shadow-md">
      <Icon icon={Target02Icon} className="size-3.5 text-primary" />
      <span className="truncate">
        Click what <span className="font-medium">{pick.label}</span> should go
        to
      </span>
      <span className="hidden truncate text-muted-foreground sm:inline">
        · any page, empty space picks the page
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Stop picking"
        onClick={() => endTargetPick(editor, null)}
      >
        <Icon icon={Cancel01Icon} className="size-3" />
      </Button>
    </div>
  )
}
