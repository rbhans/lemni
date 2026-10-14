"use client"

import { useMemo, useState } from "react"
import { useActions, useTools, useValue } from "tldraw"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"

import { formatKbd } from "../lib/kbd"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"
import { MENUS } from "./app-menubar"

interface Row {
  label: string
  kbd: string
}

/** Every shortcut, gathered from the menus, tools and plugin commands that define them. */
export function ShortcutSheet() {
  const open = useValue(studioState.shortcutSheetOpen)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => studioState.shortcutSheetOpen.set(next)}
    >
      <DialogContent className="flex h-[min(80vh,640px)] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> to open this anywhere, or{" "}
            <Kbd>{formatKbd("cmd+k").join("")}</Kbd> to search every command.
          </DialogDescription>
        </DialogHeader>
        {open ? <SheetBody /> : null}
      </DialogContent>
    </Dialog>
  )
}

function SheetBody() {
  const [query, setQuery] = useState("")
  const sections = useSections()
  const q = query.trim().toLowerCase()
  const visible = sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter(
        (row) =>
          !q ||
          row.label.toLowerCase().includes(q) ||
          section.title.toLowerCase().includes(q)
      ),
    }))
    .filter((section) => section.rows.length)

  return (
    <>
      <Input
        autoFocus
        aria-label="Filter shortcuts"
        placeholder="Filter shortcuts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="columns-1 gap-6 pr-3 sm:columns-2">
          {visible.map((section) => (
            <section key={section.title} className="mb-4 break-inside-avoid">
              <h3 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {section.title}
              </h3>
              <ul className="flex flex-col">
                {section.rows.map((row) => (
                  <li
                    key={`${row.label}-${row.kbd}`}
                    className="flex h-7 items-center justify-between gap-3 text-xs"
                  >
                    <span className="truncate">{row.label}</span>
                    <KbdGroup>
                      {formatKbd(row.kbd).map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </KbdGroup>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!visible.length ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No matching shortcuts.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </>
  )
}

function useSections(): { title: string; rows: Row[] }[] {
  const actions = useActions()
  const tools = useTools()
  const { contributions } = usePluginRuntime()

  return useMemo(() => {
    const sections: { title: string; rows: Row[] }[] = []
    const add = (title: string, rows: Row[]) => {
      const unique = rows.filter(
        (row, i) =>
          row.kbd && rows.findIndex((r) => r.label === row.label) === i
      )
      if (unique.length) sections.push({ title, rows: unique })
    }

    add("General", [
      { label: "Command palette", kbd: "cmd+k" },
      { label: "Keyboard shortcuts", kbd: "shift+/" },
      {
        label: "Light / dark theme",
        kbd: actions["toggle-dark-mode"]?.kbd ?? "",
      },
      { label: "Cancel, or leave Present mode", kbd: "esc" },
    ])

    add(
      "Tools",
      contributions.toolbar.flatMap((item) =>
        [item, ...(item.variants ?? [])].map((tool) => ({
          label: tool.label,
          kbd:
            (tool.tool ? tools[tool.tool]?.kbd : undefined) ?? tool.kbd ?? "",
        }))
      )
    )

    for (const menu of MENUS) {
      add(
        menu.label,
        contributions.menuItems
          .filter((item) => item.menu === menu.id)
          .map((item) => ({
            label: item.label,
            kbd:
              item.kbd ??
              (item.action ? actions[item.action]?.kbd : undefined) ??
              "",
          }))
      )
    }

    const groups = [...new Set(contributions.commands.map((c) => c.group))]
    for (const group of groups) {
      add(
        group,
        contributions.commands
          .filter((c) => c.group === group)
          .map((c) => ({ label: c.label, kbd: c.kbd ?? "" }))
      )
    }
    return sections
  }, [actions, tools, contributions])
}
