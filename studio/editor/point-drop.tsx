"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useEditor, type VecLike } from "tldraw"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

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
import { Icon } from "../shell/icon"
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
      const options = drops.filter((d) => d.create && (!many || d.multiple))
      if (!options.length) {
        toast.info(
          many
            ? "Nothing here takes a whole folder. Drop single points instead."
            : "Drop the point onto a shape."
        )
        return
      }
      if (options.length === 1) {
        options[0].create!.run(ctx, points, at)
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
  const creators = pending
    ? drops.filter(
        (d) => d.create && (pending.points.length === 1 || d.multiple)
      )
    : []

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
          className="w-auto min-w-48"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="max-w-64 truncate">
              Add {pending.label} as
            </DropdownMenuLabel>
            {creators.map((drop) => (
              <DropdownMenuItem
                key={drop.id}
                onClick={() => {
                  drop.create!.run(ctx, pending.points, pending.at)
                  close()
                  editor.focus()
                }}
              >
                <Icon icon={drop.create!.icon} className="size-3.5" />
                {drop.create!.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}
