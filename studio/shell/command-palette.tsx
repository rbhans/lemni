"use client"

import { useMemo } from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { useTheme } from "next-themes"
import { useActions, useEditor, useTools, useValue } from "tldraw"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"

import { openRecent, recentBoards } from "../files/board-files"
import { formatKbd } from "../lib/kbd"
import { scoreEntry } from "../lib/palette-score"
import { shapeLabel } from "../lib/shape-labels"
import { isHidden, setHidden, shapeDisplayName } from "../lib/shape-names"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"
import { useStudioContext } from "../studio-context"
import { MENUS } from "./app-menubar"
import { Icon } from "./icon"

interface Entry {
  id: string
  group: string
  label: string
  keywords?: string[]
  kbd?: string
  checked?: boolean
  run(): void
}

const MAX_LAYERS = 300

export function CommandPalette() {
  const mode = useValue(studioState.commandPalette)
  const open = mode !== "closed"
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) studioState.commandPalette.set("closed")
      }}
      title="Command palette"
      description="Search commands, layers, pages and symbols"
    >
      {open ? <PaletteBody recentOnly={mode === "recent"} /> : null}
    </CommandDialog>
  )
}

function PaletteBody({ recentOnly }: { recentOnly: boolean }) {
  const entries = useEntries(recentOnly)
  const groups = [...new Set(entries.map((entry) => entry.group))]
  const byId = new Map(entries.map((entry) => [entry.id, entry]))

  const run = (entry: Entry) => {
    studioState.commandPalette.set("closed")
    // Let the dialog close (and hand focus back) before the command opens anything.
    requestAnimationFrame(() => entry.run())
  }

  return (
    <Command
      loop
      filter={(value, search) => {
        const entry = byId.get(value)
        return entry
          ? scoreEntry(
              entry.label,
              [entry.group, ...(entry.keywords ?? [])],
              search
            )
          : 0
      }}
    >
      {/* Focus on mount rather than after the open animation, so keys typed right after ⌘K land. */}
      <CommandInput
        autoFocus
        placeholder={
          recentOnly
            ? "Search recent boards…"
            : "Type a command, layer, page or symbol…"
        }
      />
      <CommandList className="max-h-[min(60vh,440px)]">
        <CommandEmpty>
          {recentOnly ? "No recent boards yet." : "No matches."}
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {entries
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => run(entry)}
                >
                  <span className="truncate">{entry.label}</span>
                  {entry.checked ? (
                    <Icon icon={Tick02Icon} className="size-3.5 text-primary" />
                  ) : null}
                  {entry.kbd ? (
                    <CommandShortcut>
                      {formatKbd(entry.kbd).join("")}
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

function useEntries(recentOnly: boolean): Entry[] {
  const editor = useEditor()
  const ctx = useStudioContext()
  const actions = useActions()
  const tools = useTools()
  const { contributions } = usePluginRuntime()
  const { theme = "system", setTheme } = useTheme()
  const recents = useValue(recentBoards)

  return useMemo(() => {
    const recentEntries: Entry[] = recents.map((entry) => ({
      id: `recent:${entry.id}`,
      group: "Recent boards",
      label: entry.name,
      keywords: ["open", "recent", "board"],
      run: () => void openRecent(editor, entry),
    }))
    if (recentOnly) return recentEntries

    const out: Entry[] = [...recentEntries]

    // Every menu command, in menu order.
    for (const menu of MENUS) {
      for (const item of contributions.menuItems) {
        if (item.menu !== menu.id || item.id === "help-command-palette")
          continue
        if (item.disabled?.(editor)) continue
        const action = item.action ? actions[item.action] : undefined
        if (item.action && !action) continue
        out.push({
          id: `menu:${item.id}`,
          group: menu.label,
          label: item.label,
          kbd: item.kbd ?? action?.kbd,
          checked: item.checked?.(editor),
          run: () =>
            item.onSelect ? item.onSelect(ctx) : void action?.onSelect("menu"),
        })
      }
    }

    // Plugin commands.
    for (const command of contributions.commands) {
      if (command.when && !command.when(editor)) continue
      out.push({
        id: `command:${command.id}`,
        group: command.group,
        label: command.label,
        keywords: command.keywords,
        kbd: command.kbd,
        run: () => command.run(ctx),
      })
    }

    // Tools (and their variants).
    for (const item of contributions.toolbar) {
      for (const tool of [item, ...(item.variants ?? [])]) {
        if (tool.tool && !tools[tool.tool]) continue
        out.push({
          id: `tool:${item.id}:${tool.id}`,
          group: "Tools",
          label: tool.label,
          keywords: ["tool"],
          kbd: (tool.tool ? tools[tool.tool]?.kbd : undefined) ?? tool.kbd,
          run: () =>
            tool.tool ? ctx.selectTool(tool.tool) : tool.onSelect?.(ctx),
        })
      }
    }

    // Panels and workspaces.
    for (const panel of contributions.panels) {
      out.push({
        id: `panel:${panel.id}`,
        group: "Panels",
        label: `Show ${panel.title}`,
        keywords: ["panel", "open"],
        run: () =>
          panel.side === "left"
            ? ctx.openPanel(panel.id)
            : studioState.rightPanelOpen.set(true),
      })
    }
    for (const workspace of contributions.workspaces) {
      out.push({
        id: `workspace:${workspace.id}`,
        group: "Panels",
        label: `${workspace.label} workspace`,
        keywords: ["workspace", "switch"],
        run: () => ctx.setWorkspace(workspace.id),
      })
    }

    // Pages.
    const currentPage = editor.getCurrentPageId()
    for (const page of editor.getPages()) {
      if (page.id === currentPage) continue
      out.push({
        id: `page:${page.id}`,
        group: "Pages",
        label: `Go to ${page.name}`,
        keywords: ["page"],
        run: () => editor.setCurrentPage(page.id),
      })
    }

    // Layers on this page, by name: select and frame them.
    for (const shape of editor
      .getCurrentPageShapesSorted()
      .slice(-MAX_LAYERS)
      .reverse()) {
      const hidden = isHidden(shape)
      out.push({
        id: `layer:${shape.id}`,
        group: "Layers on this page",
        label: hidden
          ? `${shapeDisplayName(shape)} (hidden)`
          : shapeDisplayName(shape),
        keywords: [shapeLabel(shape), "select", "find"],
        run: () => {
          if (hidden) setHidden(editor, [shape.id], false)
          editor.select(shape.id)
          editor.zoomToSelection({ animation: { duration: 220 } })
          editor.focus()
        },
      })
    }

    // Library symbols.
    for (const collection of contributions.libraryCollections) {
      for (const item of collection.items) {
        out.push({
          id: `library:${collection.id}:${item.id}`,
          group: "Library",
          label: `Insert ${item.label}`,
          keywords: [
            collection.title,
            collection.tab.label,
            ...(item.keywords ?? []),
          ],
          run: () => {
            item.insert(ctx, editor.getViewportPageBounds().center)
            editor.focus()
          },
        })
      }
    }

    // Theme.
    for (const option of ["light", "dark", "system"] as const) {
      out.push({
        id: `theme:${option}`,
        group: "Theme",
        label: `${option[0].toUpperCase()}${option.slice(1)} theme`,
        keywords: ["theme", "appearance", option === "dark" ? "night" : "day"],
        checked: theme === option,
        run: () => setTheme(option),
      })
    }

    return out
  }, [
    recentOnly,
    recents,
    contributions,
    editor,
    ctx,
    actions,
    tools,
    theme,
    setTheme,
  ])
}
