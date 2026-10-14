"use client"

import { useEffect, useRef, useState } from "react"
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useEditor, useValue, type TLPage, type TLPageId } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import type { CategoryWithPages } from "../pages/categories"
import {
  addCustomCategory,
  createPageIn,
  removeCustomCategory,
  renameCustomCategory,
  usePageGroups,
} from "../pages/page-categories"
import { Segmented } from "./fields"
import { Icon } from "./icon"
import { Tip } from "./tip"

type Group = CategoryWithPages<TLPage>

/**
 * Every page category in the top bar, each with a dropdown of its pages; the one
 * you're in shows its page name. Collapses into one dropdown when space runs out.
 */
export function CategoryBar() {
  const editor = useEditor()
  const groups = usePageGroups()
  const currentId = useValue("current page", () => editor.getCurrentPageId(), [
    editor,
  ])
  const [collapsed, setCollapsed] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const full = useRef<HTMLDivElement>(null)

  // Measure the full bar (rendered invisibly) against the space available.
  useEffect(() => {
    const measure = () => {
      if (!area.current || !full.current) return
      setCollapsed(full.current.scrollWidth > area.current.clientWidth)
    }
    const observer = new ResizeObserver(measure)
    if (area.current) observer.observe(area.current)
    if (full.current) observer.observe(full.current)
    return () => observer.disconnect()
  }, [])

  const open = (id: TLPageId) => {
    editor.setCurrentPage(id)
    editor.focus()
  }

  return (
    <div
      ref={area}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        ref={full}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-0.5"
      >
        <FullBar groups={groups} currentId={currentId} onOpen={open} />
      </div>
      {collapsed ? (
        <CompactMenu groups={groups} currentId={currentId} onOpen={open} />
      ) : (
        <div className="flex items-center gap-0.5">
          <FullBar groups={groups} currentId={currentId} onOpen={open} />
        </div>
      )}
    </div>
  )
}

function FullBar({
  groups,
  currentId,
  onOpen,
}: {
  groups: Group[]
  currentId: TLPageId
  onOpen(id: TLPageId): void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <>
      {groups.map((group) => (
        <CategoryMenu
          key={group.id}
          group={group}
          currentId={currentId}
          onOpen={onOpen}
        />
      ))}
      <Tip label="New category" side="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New category"
          onClick={() => setAdding(true)}
        >
          <Icon icon={Add01Icon} className="size-3.5" />
        </Button>
      </Tip>
      <NewCategoryDialog
        open={adding}
        onOpenChange={setAdding}
        takenIds={groups.map((g) => g.id)}
      />
    </>
  )
}

function CategoryMenu({
  group,
  currentId,
  onOpen,
}: {
  group: Group
  currentId: TLPageId
  onOpen(id: TLPageId): void
}) {
  const editor = useEditor()
  const current = group.pages.find((page) => page.id === currentId)
  const [renaming, setRenaming] = useState(false)

  // A single-page category (the wire sheet) opens straight away.
  if (group.single) {
    return (
      <Button
        variant="ghost"
        aria-current={current ? "page" : undefined}
        className={cn(
          "gap-1.5 font-normal",
          current && "bg-muted font-semibold"
        )}
        onClick={() =>
          group.pages[0]
            ? onOpen(group.pages[0].id)
            : createPageIn(editor, group)
        }
      >
        {group.label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-current={current ? "page" : undefined}
            className={cn(
              "max-w-64 gap-1.5 font-normal",
              current && "bg-muted"
            )}
          >
            <span className={cn("truncate", current && "font-semibold")}>
              {group.label}
            </span>
            {current ? (
              <span className="truncate text-muted-foreground">
                · {current.name}
              </span>
            ) : null}
            <Icon
              icon={ArrowDown01Icon}
              className="size-3.5 text-muted-foreground"
            />
          </Button>
        }
      />
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuRadioGroup
          value={current?.id ?? ""}
          onValueChange={(id) => onOpen(id as TLPageId)}
        >
          <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
          {group.pages.map((page) => (
            <DropdownMenuRadioItem key={page.id} value={page.id} closeOnClick>
              {page.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {!group.pages.length ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            No pages yet.
          </p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => createPageIn(editor, group)}>
          <Icon icon={Add01Icon} />
          New page
        </DropdownMenuItem>
        {group.custom ? (
          <>
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              Rename category…
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                removeCustomCategory(editor, group)
                toast.info(`Removed ${group.label}`, {
                  description: group.pages.length
                    ? `Its pages moved to ${group.kind === "documents" ? "Documents" : "UI"}.`
                    : undefined,
                })
              }}
            >
              Remove category
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
      {group.custom ? (
        <RenameCategoryDialog
          open={renaming}
          onOpenChange={setRenaming}
          id={group.id}
          label={group.label}
        />
      ) : null}
    </DropdownMenu>
  )
}

/** Everything in one dropdown, for narrow windows. */
function CompactMenu({
  groups,
  currentId,
  onOpen,
}: {
  groups: Group[]
  currentId: TLPageId
  onOpen(id: TLPageId): void
}) {
  const editor = useEditor()
  const [adding, setAdding] = useState(false)
  const currentGroup = groups.find((g) =>
    g.pages.some((page) => page.id === currentId)
  )
  const current = currentGroup?.pages.find((page) => page.id === currentId)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="max-w-64 gap-1.5 font-normal">
              <span className="truncate font-semibold">
                {currentGroup?.label}
              </span>
              <span className="truncate text-muted-foreground">
                · {current?.name}
              </span>
              <Icon
                icon={ArrowDown01Icon}
                className="size-3.5 text-muted-foreground"
              />
            </Button>
          }
        />
        <DropdownMenuContent align="center" className="max-h-96 w-60">
          {groups.map((group, index) => (
            <div key={group.id} className="contents">
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuRadioGroup
                value={currentId}
                onValueChange={(id) => onOpen(id as TLPageId)}
              >
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.pages.map((page) => (
                  <DropdownMenuRadioItem
                    key={page.id}
                    value={page.id}
                    closeOnClick
                  >
                    {page.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {!group.pages.length || !group.single ? (
                <DropdownMenuItem onClick={() => createPageIn(editor, group)}>
                  <Icon icon={Add01Icon} />
                  {group.single ? `Open ${group.label}` : "New page"}
                </DropdownMenuItem>
              ) : null}
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAdding(true)}>
            New category…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewCategoryDialog
        open={adding}
        onOpenChange={setAdding}
        takenIds={groups.map((g) => g.id)}
      />
    </>
  )
}

function NewCategoryDialog({
  open,
  onOpenChange,
  takenIds,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  takenIds: string[]
}) {
  const editor = useEditor()
  const [label, setLabel] = useState("")
  const [kind, setKind] = useState<"ui" | "documents">("documents")

  const create = () => {
    if (!label.trim()) return
    const category = addCustomCategory(editor, label, kind, takenIds)
    createPageIn(editor, category)
    setLabel("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            A group of pages in the top bar. It works like Documents (files and
            markup) or like UI (graphics).
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            create()
          }}
        >
          <Input
            autoFocus
            aria-label="Category name"
            placeholder="e.g. Commissioning"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Segmented<"ui" | "documents">
            label="Works like"
            value={kind}
            options={[
              { value: "documents", label: "Documents" },
              { value: "ui", label: "UI" },
            ]}
            onChange={setKind}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!label.trim()}>
              Add category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameCategoryDialog({
  open,
  onOpenChange,
  id,
  label,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  id: string
  label: string
}) {
  const editor = useEditor()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename category</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const value = new FormData(event.currentTarget).get("label")
            if (typeof value === "string" && value.trim())
              renameCustomCategory(editor, id, value)
            onOpenChange(false)
          }}
        >
          <Input
            autoFocus
            name="label"
            aria-label="Category name"
            defaultValue={label}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
