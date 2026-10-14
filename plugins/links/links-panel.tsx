"use client"

import { useState } from "react"
import {
  File01Icon,
  FrameIcon,
  MoreHorizontalIcon,
  Search01Icon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue, type TLPageId } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  endLabel,
  getLinks,
  goToEnd,
  isLinkable,
  linkMark,
  linkToMark,
  markForLink,
} from "@/studio/links/links"
import { endKey, linksOf, sameEnd, type LinkEnd } from "@/studio/links/model"
import { usePageGroups } from "@/studio/pages/page-categories"
import { PanelHeader } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { shapeDisplayName } from "@/studio/lib/shape-names"

/** Drag format for a linkable thing (Links panel → wire sheet). */
export const LINK_END_DRAG_TYPE = "application/x-lemni-link-end"

interface Row {
  end: LinkEnd
  label: string
  count: number
}

/** Everything that can be linked, by category and page, with link counts. */
export function LinksPanel() {
  const editor = useEditor()
  const groups = usePageGroups()
  const [query, setQuery] = useState("")
  const data = useValue(
    "linkable things",
    () => {
      const links = getLinks(editor)
      const count = (end: LinkEnd) => linksOf(links, end).length
      const pages = new Map<TLPageId, { page: Row; items: Row[] }>()
      for (const page of editor.getPages()) {
        const pageEnd: LinkEnd = { kind: "page", pageId: page.id }
        const items: Row[] = []
        for (const id of editor.getPageShapeIds(page.id)) {
          const shape = editor.getShape(id)
          if (!shape || !isLinkable(shape)) continue
          const end: LinkEnd = { kind: "shape", shapeId: id }
          items.push({ end, label: shapeDisplayName(shape), count: count(end) })
        }
        items.sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true })
        )
        pages.set(page.id, {
          page: { end: pageEnd, label: page.name, count: count(pageEnd) },
          items,
        })
      }
      const points = new Map<string, Row>()
      for (const link of links)
        for (const end of [link.a, link.b])
          if (end.kind === "point")
            points.set(endKey(end), {
              end,
              label: end.label,
              count: count(end),
            })
      return { pages, points: [...points.values()] }
    },
    [editor]
  )

  const q = query.trim().toLowerCase()
  const matches = (row: Row) => !q || row.label.toLowerCase().includes(q)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Links" />
      <div className="px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <Icon icon={Search01Icon} className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Filter linkable things"
            placeholder="Frames, documents, pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      </div>
      <ScrollArea className="min-h-0 flex-1 border-t">
        <div className="flex flex-col py-1.5">
          {groups
            .filter((group) => group.kind !== "wiresheet" && group.pages.length)
            .map((group) => (
              <section key={group.id} aria-label={group.label} className="pb-1">
                <p className="px-3.5 pt-1.5 pb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.pages.map((page) => {
                  const entry = data.pages.get(page.id)
                  if (!entry) return null
                  const items = entry.items.filter(matches)
                  if (q && !items.length && !matches(entry.page)) return null
                  return (
                    <div key={page.id}>
                      <LinkRow row={entry.page} icon={File01Icon} depth={0} />
                      {items.map((row) => (
                        <LinkRow
                          key={endKey(row.end)}
                          row={row}
                          icon={FrameIcon}
                          depth={1}
                        />
                      ))}
                    </div>
                  )
                })}
              </section>
            ))}
          {data.points.filter(matches).length ? (
            <section aria-label="Station" className="pb-1">
              <p className="px-3.5 pt-1.5 pb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                Station
              </p>
              {data.points.filter(matches).map((row) => (
                <LinkRow
                  key={endKey(row.end)}
                  row={row}
                  icon={ServerStack01Icon}
                  depth={0}
                />
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
      <p className="border-t px-3.5 py-2 text-[11px] text-muted-foreground">
        Drag a row onto the wire sheet to place it there.
      </p>
    </div>
  )
}

function LinkRow({
  row,
  icon,
  depth,
}: {
  row: Row
  icon: Parameters<typeof Icon>[0]["icon"]
  depth: number
}) {
  const editor = useEditor()
  const mark = useValue(linkMark)
  const markLabel = useValue(
    "mark label",
    () => {
      const m = linkMark.get()
      return m ? endLabel(editor, m) : ""
    },
    [editor]
  )
  return (
    <div
      className="group flex h-7 items-center gap-1.5 pr-1.5 text-xs hover:bg-muted"
      style={{ paddingLeft: 14 + depth * 14 }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(LINK_END_DRAG_TYPE, JSON.stringify(row.end))
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      <Icon icon={icon} className="size-3.5 text-muted-foreground" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        onClick={() => goToEnd(editor, row.end)}
      >
        {row.label}
      </button>
      {row.count ? (
        <span
          className={cn(
            "shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular-nums",
            "group-hover:bg-background"
          )}
        >
          {row.count}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${row.label} options`}
              className="opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <Icon icon={MoreHorizontalIcon} className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => goToEnd(editor, row.end)}>
            Go to
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => markForLink(row.end)}>
            Link mark
          </DropdownMenuItem>
          {mark && !sameEnd(mark, row.end) ? (
            <DropdownMenuItem onClick={() => linkToMark(editor, row.end)}>
              <span className="truncate">Link to {markLabel}</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
