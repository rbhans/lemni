"use client"

import { useState } from "react"
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  BrowserIcon,
  CircleIcon,
  File01Icon,
  FrameIcon,
  Image01Icon,
  Layers01Icon,
  MoreHorizontalIcon,
  PencilIcon,
  SquareIcon,
  SquareLock02Icon,
  StickyNote02Icon,
  TextFontIcon,
  Video01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import {
  getIndexBetween,
  PageRecordType,
  useEditor,
  useValue,
  type Editor,
  type TLPage,
  type TLPageId,
  type TLParentId,
  type TLShape,
  type TLShapeId,
} from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  customShapeName,
  isHidden,
  renameShape,
  setHidden,
  shapeDisplayName,
} from "@/studio/lib/shape-names"
import { shapeLabel } from "@/studio/lib/shape-labels"
import type { CategoryWithPages } from "@/studio/pages/categories"
import {
  createPageIn,
  setPageCategory,
  usePageGroups,
} from "@/studio/pages/page-categories"
import { PanelHeader } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { InlineName, useInlineEditing } from "@/studio/shell/inline-name"
import { Tip } from "@/studio/shell/tip"

const TYPE_ICONS: Record<string, IconSvgElement> = {
  geo: SquareIcon,
  draw: PencilIcon,
  highlight: PencilIcon,
  text: TextFontIcon,
  note: StickyNote02Icon,
  arrow: ArrowUpRight01Icon,
  line: ArrowUpRight01Icon,
  frame: FrameIcon,
  group: Layers01Icon,
  image: Image01Icon,
  video: Video01Icon,
  embed: BrowserIcon,
  bookmark: BrowserIcon,
}

function iconFor(shape: TLShape) {
  if (
    shape.type === "geo" &&
    "geo" in shape.props &&
    (shape.props.geo === "ellipse" || shape.props.geo === "oval")
  ) {
    return CircleIcon
  }
  return TYPE_ICONS[shape.type] ?? SquareIcon
}

/** Top-most first, like an illustration app's layer list. */
function childrenOf(editor: Editor, parent: TLParentId): TLShapeId[] {
  return [...editor.getSortedChildIdsForParent(parent)].reverse()
}

export function LayersPanel() {
  const editor = useEditor()
  const pageId = useValue("page id", () => editor.getCurrentPageId(), [editor])
  const roots = useValue("root layers", () => childrenOf(editor, pageId), [
    editor,
    pageId,
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PagesSection />
      <PanelHeader title="Layers" />
      <ScrollArea className="min-h-0 flex-1 border-t">
        {roots.length ? (
          <ul className="flex flex-col py-1.5">
            {roots.map((id) => (
              <LayerRow key={id} id={id} depth={0} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            This page is empty. Draw something, or add a symbol from the
            Library.
          </p>
        )}
      </ScrollArea>
    </div>
  )
}

// ---- Pages ----------------------------------------------------------------------------

/** Pages grouped by category; "+" adds a page to the category you're in. */
function PagesSection() {
  const editor = useEditor()
  const groups = usePageGroups()
  const currentId = useValue("current page", () => editor.getCurrentPageId(), [
    editor,
  ])
  const allPages = groups.flatMap((group) => group.pages)
  const currentGroup =
    groups.find((group) => group.pages.some((page) => page.id === currentId)) ??
    groups.find((group) => group.id === "ui")
  // Single-page categories (the wire sheet) are opened from the top bar.
  const shown = groups.filter((group) => group.pages.length && !group.single)

  return (
    <section aria-label="Pages" className="flex shrink-0 flex-col border-b">
      <PanelHeader title="Pages">
        {currentGroup && !currentGroup.single ? (
          <Tip label={`Add page to ${currentGroup.label}`} side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add page"
              onClick={() => createPageIn(editor, currentGroup)}
            >
              <Icon icon={Add01Icon} className="size-3.5" />
            </Button>
          </Tip>
        ) : null}
      </PanelHeader>
      <ScrollArea className="max-h-52">
        <div className="flex flex-col pb-1.5">
          {shown.map((group) => (
            <div key={group.id} role="group" aria-label={group.label}>
              {shown.length > 1 ? (
                <p className="px-3.5 pt-1.5 pb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
              ) : null}
              <ul className="flex flex-col">
                {group.pages.map((page) => (
                  <PageRow
                    key={page.id}
                    page={page}
                    current={page.id === currentId}
                    group={group}
                    groups={groups}
                    allPages={allPages}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  )
}

function PageRow({
  page,
  current,
  group,
  groups,
  allPages,
}: {
  page: TLPage
  current: boolean
  group: CategoryWithPages<TLPage>
  groups: CategoryWithPages<TLPage>[]
  allPages: TLPage[]
}) {
  const editor = useEditor()
  const rename = useInlineEditing()
  const position = group.pages.findIndex((p) => p.id === page.id)
  const ordered = editor.getPages()

  // Fractional indexes: slot the page next to its neighbour within the category.
  const move = (delta: -1 | 1) => {
    const neighbour = group.pages[position + delta]
    if (!neighbour) return
    const at = ordered.findIndex((p) => p.id === neighbour.id)
    const below = delta === -1 ? ordered[at - 1]?.index : neighbour.index
    const above = delta === -1 ? neighbour.index : ordered[at + 1]?.index
    editor.markHistoryStoppingPoint("move page")
    editor.updatePage({ id: page.id, index: getIndexBetween(below, above) })
  }

  const duplicate = () => {
    const id = PageRecordType.createId()
    editor.markHistoryStoppingPoint("duplicate page")
    editor.duplicatePage(page.id, id)
    editor.setCurrentPage(id)
  }

  const remove = () => {
    editor.markHistoryStoppingPoint("delete page")
    editor.deletePage(page.id)
  }

  const destinations = groups.filter(
    (other) => other.id !== group.id && !other.single
  )

  return (
    <li
      className={cn(
        "group flex h-7 items-center gap-2 pr-1.5 pl-3.5 text-xs",
        current ? "bg-primary/20" : "hover:bg-muted"
      )}
    >
      <Icon icon={File01Icon} className="size-3.5 text-muted-foreground" />
      {rename.editing ? (
        <InlineName
          key={rename.key}
          label="Page name"
          value={page.name}
          editing
          onEditingChange={rename.setEditing}
          onCommit={(name) => {
            if (name.trim() && name.trim() !== page.name) {
              editor.markHistoryStoppingPoint("rename page")
              editor.renamePage(page.id, name.trim())
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-current={current ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center text-left"
          onClick={() => editor.setCurrentPage(page.id as TLPageId)}
          onDoubleClick={rename.start}
        >
          <span className={cn("truncate", current && "font-medium")}>
            {page.name}
          </span>
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${page.name} options`}
              className="opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <Icon icon={MoreHorizontalIcon} className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={rename.start}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem disabled={position === 0} onClick={() => move(-1)}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={position === group.pages.length - 1}
            onClick={() => move(1)}
          >
            Move down
          </DropdownMenuItem>
          {destinations.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                {destinations.map((destination) => (
                  <DropdownMenuItem
                    key={destination.id}
                    onClick={() => setPageCategory(editor, page, destination)}
                  >
                    {destination.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={allPages.length < 2}
            onClick={remove}
          >
            Delete page
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

// ---- Layers ---------------------------------------------------------------------------

function LayerRow({ id, depth }: { id: TLShapeId; depth: number }) {
  const editor = useEditor()
  const [open, setOpen] = useState(true)
  const rename = useInlineEditing()
  const row = useValue(
    `layer ${id}`,
    () => {
      const shape = editor.getShape(id)
      if (!shape) return null
      return {
        shape,
        selected: editor.getSelectedShapeIds().includes(id),
        children: childrenOf(editor, id),
      }
    },
    [editor, id]
  )
  if (!row) return null
  const { shape, selected, children } = row
  const hasChildren = children.length > 0
  const hidden = isHidden(shape)

  return (
    <li>
      <div
        className={cn(
          "group flex h-7 items-center gap-1.5 pr-2 text-xs",
          selected ? "bg-primary/20" : "hover:bg-muted"
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onPointerEnter={() => editor.setHoveredShape(id)}
        onPointerLeave={() => editor.setHoveredShape(null)}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex size-4 items-center justify-center text-muted-foreground",
            !hasChildren && "invisible"
          )}
        >
          <Icon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className="size-3"
            strokeWidth={2}
          />
        </button>
        {rename.editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon
              icon={iconFor(shape)}
              className="size-3.5 text-muted-foreground"
            />
            <InlineName
              key={rename.key}
              label="Layer name"
              value={customShapeName(shape) ?? ""}
              placeholder={shapeLabel(shape)}
              editing
              onEditingChange={rename.setEditing}
              onCommit={(name) => renameShape(editor, id, name)}
            />
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 text-left",
              hidden && "opacity-45"
            )}
            onClick={(event) => {
              if (hidden) return
              if (event.shiftKey || event.metaKey) {
                editor.setSelectedShapes(
                  selected
                    ? editor
                        .getSelectedShapeIds()
                        .filter((other) => other !== id)
                    : [...editor.getSelectedShapeIds(), id]
                )
              } else {
                editor.select(id)
              }
            }}
            onDoubleClick={rename.start}
            title="Double-click to rename"
          >
            <Icon
              icon={iconFor(shape)}
              className="size-3.5 text-muted-foreground"
            />
            <span className="truncate">{shapeDisplayName(shape)}</span>
          </button>
        )}
        <button
          type="button"
          aria-label={hidden ? "Show" : "Hide"}
          aria-pressed={hidden}
          onClick={() => setHidden(editor, [id], !hidden)}
          className={cn(
            "flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            !hidden && "opacity-0 group-hover:opacity-100"
          )}
        >
          <Icon
            icon={hidden ? ViewOffSlashIcon : ViewIcon}
            className="size-3.5"
          />
        </button>
        <button
          type="button"
          aria-label={shape.isLocked ? "Unlock" : "Lock"}
          aria-pressed={shape.isLocked}
          onClick={() =>
            editor.updateShape({
              id,
              type: shape.type,
              isLocked: !shape.isLocked,
            })
          }
          className={cn(
            "flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            !shape.isLocked && "opacity-0 group-hover:opacity-100"
          )}
        >
          <Icon icon={SquareLock02Icon} className="size-3.5" />
        </button>
      </div>
      {hasChildren && open ? (
        <ul>
          {children.map((child) => (
            <LayerRow key={child} id={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
