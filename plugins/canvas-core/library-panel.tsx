"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue } from "tldraw"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { currentPageKind } from "@/studio/pages/page-categories"
import { usePluginRuntime } from "@/studio/plugins/runtime"
import type { LibraryItem } from "@/studio/plugins/types"
import { PanelHeader } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { useStudioContext } from "@/studio/studio-context"

const DRAG_TYPE = "application/x-lemscape-library-item"

/**
 * One library for every plugin: each contributes collections to a tab
 * (Shapes, HVAC, Images, ...). Click a tile to drop it in view, or drag it.
 */
export function LibraryPanel() {
  const editor = useEditor()
  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()
  const kind = useValue("page kind", () => currentPageKind(editor), [editor])
  // Library items are for UI pages unless a collection says otherwise.
  const collections = useMemo(
    () =>
      contributions.libraryCollections.filter((collection) =>
        (collection.pageKinds ?? ["ui"]).includes(kind)
      ),
    [contributions.libraryCollections, kind]
  )

  const tabs = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; order: number }>()
    for (const collection of collections)
      seen.set(collection.tab.id, collection.tab)
    return [...seen.values()].sort((a, b) => a.order - b.order)
  }, [collections])

  const [tabId, setTabId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]

  const itemsById = useMemo(() => {
    const map = new Map<string, LibraryItem>()
    for (const collection of collections)
      for (const item of collection.items)
        map.set(`${collection.id}/${item.id}`, item)
    return map
  }, [collections])

  // Drops from the library land where the pointer is released.
  useEffect(() => {
    const container = editor.getContainer()
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    }
    const onDrop = (event: DragEvent) => {
      const key = event.dataTransfer?.getData(DRAG_TYPE)
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      const item = itemsById.get(key)
      if (item)
        item.insert(
          ctx,
          editor.screenToPage({ x: event.clientX, y: event.clientY })
        )
    }
    container.addEventListener("dragover", onDragOver, true)
    container.addEventListener("drop", onDrop, true)
    return () => {
      container.removeEventListener("dragover", onDragOver, true)
      container.removeEventListener("drop", onDrop, true)
    }
  }, [editor, ctx, itemsById])

  const q = query.trim().toLowerCase()
  const visible = collections
    .filter((collection) => collection.tab.id === tab?.id)
    .map((collection) => ({
      ...collection,
      items: collection.items.filter(
        (item) =>
          !q ||
          [item.label, ...(item.keywords ?? [])].some((text) =>
            text.toLowerCase().includes(q)
          )
      ),
    }))
    .filter((collection) => collection.items.length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Library" />
      <div className="flex flex-col gap-2 px-3 pb-2.5">
        <InputGroup>
          <InputGroupAddon>
            <Icon icon={Search01Icon} className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search library"
            placeholder="Search symbols and shapes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        {tabs.length > 1 ? (
          <div
            role="group"
            aria-label="Library sections"
            className="grid gap-0.5 rounded-md bg-muted p-0.5"
            style={{
              gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            }}
          >
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === tab?.id}
                onClick={() => setTabId(entry.id)}
                className={cn(
                  "h-6 rounded-[5px] text-[11.5px] font-medium text-muted-foreground hover:text-foreground",
                  entry.id === tab?.id &&
                    "bg-background text-foreground shadow-xs"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {collections.length
              ? "No matches."
              : contributions.libraryCollections.length
                ? "The Library's symbols and widgets go on UI pages."
                : "Turn on a library plugin to add symbols here."}
          </p>
        ) : (
          visible.map((collection) => {
            const isCollapsed = collapsed[collection.id]
            return (
              <section key={collection.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [collection.id]: !isCollapsed,
                    }))
                  }
                  className="flex h-9 w-full items-center gap-1.5 px-3.5 text-left text-xs font-semibold"
                >
                  <Icon
                    icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
                    className="size-3.5 text-muted-foreground"
                  />
                  <span className="flex-1">{collection.title}</span>
                  <span className="font-mono text-[11px] font-normal text-muted-foreground">
                    {collection.items.length}
                  </span>
                </button>
                {isCollapsed ? null : (
                  <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                    {collection.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        title={item.label}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            DRAG_TYPE,
                            `${collection.id}/${item.id}`
                          )
                          event.dataTransfer.effectAllowed = "copy"
                        }}
                        onClick={() => {
                          item.insert(
                            ctx,
                            editor.getViewportPageBounds().center
                          )
                          editor.focus()
                        }}
                        className="flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-lg border bg-background text-[11px] text-foreground/80 transition-colors hover:border-ring hover:bg-muted/50"
                      >
                        <span className="flex h-8 w-10 items-center justify-center">
                          {item.preview}
                        </span>
                        <span className="max-w-full truncate px-1">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })
        )}
      </ScrollArea>
    </div>
  )
}
