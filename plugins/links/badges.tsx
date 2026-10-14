"use client"

import { Link01Icon } from "@hugeicons/core-free-icons"
import { useEditor, useValue, type TLShapeId } from "tldraw"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  endLabel,
  endPlace,
  getLinks,
  goToEnd,
  isLinkable,
} from "@/studio/links/links"
import {
  endKey,
  linksOf,
  otherEnd,
  sideOf,
  type LinkEnd,
} from "@/studio/links/model"
import { currentPageKind } from "@/studio/pages/page-categories"
import { Icon } from "@/studio/shell/icon"
import { studioState } from "@/studio/state"

/**
 * A small link count on each linked frame or document, just above its top-right
 * corner. Hidden in Present mode and on the wire sheet.
 */
export function LinkBadges() {
  const editor = useEditor()
  const presenting = useValue(studioState.presenting)
  const badges = useValue(
    "link badges",
    () => {
      if (currentPageKind(editor) === "wiresheet") return []
      const links = getLinks(editor)
      if (!links.length) return []
      return [...editor.getCurrentPageShapeIds()].flatMap((id) => {
        const shape = editor.getShape(id)
        if (!isLinkable(shape)) return []
        const count = linksOf(links, { kind: "shape", shapeId: id }).length
        const bounds = count ? editor.getShapePageBounds(id) : null
        return bounds ? [{ id, count, x: bounds.maxX, y: bounds.minY }] : []
      })
    },
    [editor]
  )
  // Badges keep their size on screen whatever the zoom.
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  if (presenting || !badges.length) return null
  return (
    <>
      {badges.map((badge) => (
        <div
          key={badge.id}
          className="absolute"
          style={{
            left: badge.x,
            top: badge.y - 4 / zoom,
            transform: `translate(-100%, -100%) scale(${1 / zoom})`,
            transformOrigin: "100% 100%",
            zIndex: editor.options.maxShapesPerPage * 4,
          }}
        >
          <LinkBadge shapeId={badge.id} count={badge.count} />
        </div>
      ))}
    </>
  )
}

function LinkBadge({ shapeId, count }: { shapeId: TLShapeId; count: number }) {
  const editor = useEditor()
  const end: LinkEnd = { kind: "shape", shapeId }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${count} ${count === 1 ? "link" : "links"}`}
            className="pointer-events-auto flex h-5 items-center gap-1 rounded-full border bg-background px-1.5 text-[10.5px] text-muted-foreground shadow-xs hover:text-foreground"
            // A click on the badge isn't the start of a drag on the canvas.
            onPointerDown={(event) => event.stopPropagation()}
          />
        }
      >
        <Icon icon={Link01Icon} className="size-3" />
        <span className="tabular-nums">{count}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-1.5">
        <LinkList end={end} onGo={() => editor.focus()} />
      </PopoverContent>
    </Popover>
  )
}

/** The other ends of an end's links, each a button that goes there. */
export function LinkList({ end, onGo }: { end: LinkEnd; onGo?(): void }) {
  const editor = useEditor()
  const key = endKey(end)
  const rows = useValue(
    "link list",
    () =>
      linksOf(getLinks(editor), end).map((link) => {
        const from = sideOf(link, end)
        const other = otherEnd(link, from)
        return {
          id: link.id,
          other,
          label: endLabel(editor, other),
          place: endPlace(editor, other),
          via: from === end ? null : endLabel(editor, from),
          comment: link.comment,
        }
      }),
    // `end` is described fully by its key.
    [editor, key]
  )
  if (!rows.length)
    return <p className="px-2 py-1.5 text-muted-foreground">No links.</p>
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              goToEnd(editor, row.other)
              onGo?.()
            }}
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{row.label}</span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">
                {row.place}
              </span>
            </span>
            {row.via ? (
              <span className="text-[10.5px] text-muted-foreground">
                from {row.via}
              </span>
            ) : null}
            {row.comment ? (
              <span className="line-clamp-2 text-[11px] text-muted-foreground">
                {row.comment}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
