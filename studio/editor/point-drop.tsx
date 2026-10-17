"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useEditor, useValue, type VecLike } from "tldraw"

import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import {
  FOLDER_DRAG_TYPE,
  getDataSource,
  POINT_DRAG_TYPE,
  readFolderDrag,
  readPointDrag,
  type FolderDragData,
  type PointDragData,
} from "../data/live-points"
import { currentPageKind } from "../pages/page-categories"
import { usePluginRuntime } from "../plugins/runtime"
import type {
  PointCreateOption,
  PointDropContribution,
  PointMenuGroup,
} from "../plugins/types"
import { Icon } from "../shell/icon"
import { studioState } from "../state"
import { useStudioContext } from "../studio-context"

/** Most points a dropped folder brings in. */
const MAX_FOLDER_POINTS = 300

interface Pending {
  points: PointDragData[]
  /** What was dragged, for the menu heading. */
  label: string
  /** Drop position on the page. */
  at: VecLike
  /** Drop position on screen, for the menu. */
  client: { x: number; y: number }
}

/** The points in a dropped folder, read from its source. */
async function folderPoints(folder: FolderDragData) {
  const source = getDataSource(folder.source)
  if (!source?.pointsUnder) {
    toast.error("Connect to the station to use its folders.")
    return null
  }
  const options = await toast
    .promise(source.pointsUnder(folder.folder, MAX_FOLDER_POINTS), {
      loading: `Reading points in ${folder.label}…`,
      success: (list) =>
        list.length >= MAX_FOLDER_POINTS
          ? `Using the first ${MAX_FOLDER_POINTS} points in ${folder.label}.`
          : `${list.length} points in ${folder.label}`,
      error: `Couldn't read ${folder.label}.`,
    })
    .unwrap()
    .catch(() => null)
  if (!options) return null
  if (!options.length) {
    toast.info(`${folder.label} has no points.`)
    return null
  }
  return options.map<PointDragData>((option) => ({
    source: folder.source,
    point: option.point,
    label: option.label,
    kind: option.kind,
  }))
}

interface MenuOption {
  key: string
  label: string
  icon: PointCreateOption["icon"]
  preview?: PointCreateOption["preview"]
  section?: string
  group: PointMenuGroup | null
  suggested: boolean
  run: PointCreateOption["run"]
}

/**
 * What dropped points can become on empty canvas: every plugin's options that suit
 * them, minus plugins hidden from this menu in the Plugins dialog.
 */
function menuOptions(
  drops: readonly (PointDropContribution & { pluginId: string })[],
  points: PointDragData[],
  hidden: readonly string[]
): MenuOption[] {
  const many = points.length > 1
  const out: MenuOption[] = []
  for (const drop of drops) {
    if (hidden.includes(drop.pluginId)) continue
    const group = drop.group ?? null
    if (drop.create && (!many || drop.multiple))
      out.push({
        key: drop.id,
        label: drop.create.label,
        icon: drop.create.icon,
        group,
        suggested: false,
        run: drop.create.run,
      })
    for (const option of drop.creates ?? []) {
      if (many && !option.multiple) continue
      if (option.accepts && !option.accepts(points)) continue
      out.push({
        key: `${drop.id}/${option.id}`,
        label: option.label,
        icon: option.icon,
        preview: option.preview,
        section: option.section,
        group,
        suggested: option.suggested?.(points) ?? false,
        run: option.run,
      })
    }
  }
  return out
}

/**
 * Routes points dragged from the Station panel onto the canvas. A shape under the
 * pointer goes to the first contribution that claims it (a chart adds series, any
 * other shape gets a behavior); empty canvas offers what plugins can create. A
 * dropped folder brings every point inside it, for contributions that take several.
 */
export function PointDrop() {
  const editor = useEditor()
  const ctx = useStudioContext()
  const drops = usePluginRuntime().contributions.pointDrops
  const hidden = useValue(studioState.pointMenuHidden)
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    const container = editor.getContainer()

    const resolve = (clientX: number, clientY: number, many: boolean) => {
      const at = editor.screenToPage({ x: clientX, y: clientY })
      const hit = editor.getShapeAtPoint(at, { hitInside: true, margin: 6 })
      if (hit) {
        for (const drop of drops) {
          if (many && !drop.multiple) continue
          const shape = drop.target?.(editor, hit)
          if (shape && drop.drop) return { at, shape, drop }
        }
      }
      return { at, shape: null, drop: null }
    }

    const draggingFolder = (event: DragEvent) =>
      Boolean(event.dataTransfer?.types.includes(FOLDER_DRAG_TYPE))

    const onDragOver = (event: DragEvent) => {
      const types = event.dataTransfer?.types ?? []
      if (!types.includes(POINT_DRAG_TYPE) && !types.includes(FOLDER_DRAG_TYPE))
        return
      event.preventDefault()
      const { shape } = resolve(
        event.clientX,
        event.clientY,
        draggingFolder(event)
      )
      event.dataTransfer!.dropEffect = shape ? "link" : "copy"
      // Outline the shape that would take the points.
      editor.setHoveredShape(shape?.id ?? null)
    }

    const onDragLeave = (event: DragEvent) => {
      if (!container.contains(event.relatedTarget as Node | null))
        editor.setHoveredShape(null)
    }

    const onDrop = async (event: DragEvent) => {
      const point = readPointDrag(event.dataTransfer)
      const folder = point ? null : readFolderDrag(event.dataTransfer)
      if (!point && !folder) return
      event.preventDefault()
      event.stopPropagation()
      editor.setHoveredShape(null)
      if (currentPageKind(editor) !== "ui") {
        toast.info("Points go on UI pages.", {
          description:
            "To connect a point to a document, use Link mark instead.",
        })
        return
      }
      const many = folder !== null
      const { at, shape, drop } = resolve(event.clientX, event.clientY, many)
      const client = { x: event.clientX, y: event.clientY }

      const points = point ? [point] : await folderPoints(folder!)
      if (!points) return

      if (shape && drop?.drop) {
        drop.drop(ctx, shape, points)
        editor.focus()
        return
      }
      const options = menuOptions(
        drops,
        points,
        studioState.pointMenuHidden.get()
      )
      if (!options.length) {
        toast.info(
          many
            ? "Nothing here takes a whole folder. Drop single points instead."
            : "Drop the point onto a shape."
        )
        return
      }
      if (options.length === 1) {
        options[0].run(ctx, points, at)
        editor.focus()
        return
      }
      setPending({
        points,
        label: point
          ? point.label
          : `${folder!.label} (${points.length} points)`,
        at,
        client,
      })
    }

    const handleDrop = (event: DragEvent) => void onDrop(event)
    container.addEventListener("dragover", onDragOver, true)
    container.addEventListener("dragleave", onDragLeave, true)
    container.addEventListener("drop", handleDrop, true)
    return () => {
      container.removeEventListener("dragover", onDragOver, true)
      container.removeEventListener("dragleave", onDragLeave, true)
      container.removeEventListener("drop", handleDrop, true)
    }
  }, [editor, ctx, drops])

  const close = () => setPending(null)
  const options = pending ? menuOptions(drops, pending.points, hidden) : []
  const choose = (option: MenuOption) => {
    if (!pending) return
    option.run(ctx, pending.points, pending.at)
    close()
    editor.focus()
  }

  return (
    <DropdownMenu
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {pending ? (
        <DropdownMenuContent
          anchor={{
            getBoundingClientRect: () =>
              DOMRect.fromRect({ ...pending.client, width: 0, height: 0 }),
          }}
          className="w-auto max-w-none overflow-visible p-0"
        >
          <CascadeMenu
            key={pending.label}
            title={`Add ${pending.label} as`}
            options={options}
            onChoose={choose}
          />
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}

// ---- Cascading menu -------------------------------------------------------------------
// Flyouts are columns inside the one menu rather than Base UI submenus: a submenu of a
// menu opened at a point (no trigger) closes as soon as the pointer moves into it.

/** One level of the cascade: rows that open the next level, and options. */
interface Level {
  rows: { id: string; label: string; next: Level }[]
  options: MenuOption[]
  /** Options shown above the rows, under a "Suggested" heading. */
  suggested: MenuOption[]
}

/** Groups become flyouts; inside one, sections become flyouts of their own. */
function buildLevel(options: MenuOption[]): Level {
  const top = options.filter((o) => !o.group)
  const groups = new Map<
    string,
    { group: PointMenuGroup; options: MenuOption[] }
  >()
  for (const option of options) {
    if (!option.group) continue
    const entry = groups.get(option.group.id) ?? {
      group: option.group,
      options: [],
    }
    entry.options.push(option)
    groups.set(option.group.id, entry)
  }
  const sorted = [...groups.values()].sort(
    (a, b) => a.group.order - b.group.order
  )
  // With a single flyout there's nothing to choose between: show its options directly.
  if (sorted.length === 1 && !top.length) return groupLevel(sorted[0].options)
  return {
    suggested: [],
    options: top,
    rows: sorted.map(({ group, options }) => ({
      id: group.id,
      label: group.label,
      next: groupLevel(options),
    })),
  }
}

function groupLevel(options: MenuOption[]): Level {
  const suggested = options.filter((o) => o.suggested)
  const rest = options.filter((o) => !o.suggested)
  const sections = [
    ...new Set(rest.map((o) => o.section).filter(Boolean)),
  ] as string[]
  // Sections only earn a flyout when there are several of them.
  if (sections.length < 2) return { suggested, options: rest, rows: [] }
  return {
    suggested,
    options: rest.filter((o) => !o.section),
    rows: sections.map((section) => ({
      id: section,
      label: section,
      next: {
        suggested: [],
        rows: [],
        options: rest.filter((o) => o.section === section),
      },
    })),
  }
}

/** How long the pointer rests on a row before its flyout opens (lets it cross other rows). */
const HOVER_INTENT_MS = 110

function CascadeMenu({
  title,
  options,
  onChoose,
}: {
  title: string
  options: MenuOption[]
  onChoose(option: MenuOption): void
}) {
  const root = buildLevel(options)
  // The open row at each depth, e.g. ["hvac", "Air side"].
  const [path, setPath] = useState<string[]>([])
  const columns: Level[] = [root]
  for (const id of path) {
    const next = columns.at(-1)?.rows.find((row) => row.id === id)?.next
    if (!next) break
    columns.push(next)
  }

  return (
    <div className="flex items-start">
      {columns.map((level, depth) => (
        <Column
          key={depth}
          title={depth === 0 ? title : undefined}
          level={level}
          openId={path[depth] ?? null}
          onOpen={(id) => setPath([...path.slice(0, depth), id])}
          onChoose={onChoose}
          className={cn(depth > 0 && "border-l")}
        />
      ))}
    </div>
  )
}

function Column({
  title,
  level,
  openId,
  onOpen,
  onChoose,
  className,
}: {
  title?: string
  level: Level
  openId: string | null
  onOpen(id: string): void
  onChoose(option: MenuOption): void
  className?: string
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const item = (option: MenuOption) => (
    <DropdownMenuItem
      key={option.key}
      onClick={() => onChoose(option)}
      onMouseMove={clear}
    >
      {option.preview ? (
        <span className="flex size-5 shrink-0 items-center justify-center">
          {option.preview}
        </span>
      ) : (
        <Icon icon={option.icon} className="size-3.5" />
      )}
      {option.label}
    </DropdownMenuItem>
  )
  return (
    <div className={cn("max-h-80 min-w-44 overflow-y-auto p-1", className)}>
      <DropdownMenuGroup>
        {title ? (
          <DropdownMenuLabel className="max-w-64 truncate">
            {title}
          </DropdownMenuLabel>
        ) : null}
        {level.suggested.length ? (
          <>
            <DropdownMenuLabel>Suggested</DropdownMenuLabel>
            {level.suggested.map(item)}
            {level.rows.length || level.options.length ? (
              <DropdownMenuSeparator />
            ) : null}
          </>
        ) : null}
        {level.rows.map((row) => (
          <DropdownMenuItem
            key={row.id}
            closeOnClick={false}
            data-open={openId === row.id ? "" : undefined}
            className="data-open:bg-accent data-open:text-accent-foreground"
            onClick={() => {
              clear()
              onOpen(row.id)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") onOpen(row.id)
            }}
            // Mouse movement (not just entering) so a row under a resting pointer still opens.
            onMouseMove={() => {
              if (openId === row.id || timer.current) return
              timer.current = setTimeout(() => {
                timer.current = null
                onOpen(row.id)
              }, HOVER_INTENT_MS)
            }}
            onMouseLeave={clear}
          >
            {row.label}
            <Icon
              icon={ArrowRight01Icon}
              className="ml-auto size-3.5 text-muted-foreground"
            />
          </DropdownMenuItem>
        ))}
        {level.options.map(item)}
      </DropdownMenuGroup>
    </div>
  )
}
