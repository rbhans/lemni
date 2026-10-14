"use client"

import {
  Clock01Icon,
  FileAddIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  ComputerIcon,
  Download01Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { useTheme } from "next-themes"
import { useActions, useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import {
  newBoard,
  openBoard,
  openRecent,
  recentBoards,
  saveBoard,
  supportsFileAccess,
} from "../files/board-files"
import { formatKbd } from "../lib/kbd"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"
import { AppMenubar } from "./app-menubar"
import { CategoryBar } from "./category-bar"
import { BrandMark, PRODUCT_NAME, PRODUCT_TAGLINE } from "./brand"
import { Icon } from "./icon"
import { Tip } from "./tip"
import { useWorkspace } from "./workspace"

export function TopBar() {
  const { contributions } = usePluginRuntime()

  return (
    <header className="flex h-11 items-center gap-2 border-b bg-background px-2.5">
      {/* The menubar keeps its width; the categories and right side give way instead. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Tip label={PRODUCT_TAGLINE} side="bottom">
          <div
            tabIndex={-1}
            className="flex shrink-0 cursor-default items-center gap-2 pr-1.5 pl-0.5 text-[13px] font-semibold whitespace-nowrap outline-none"
          >
            <BrandMark />
            {PRODUCT_NAME}
          </div>
        </Tip>
        <AppMenubar />
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        {/* The board name is also under File; on narrow windows it's left out. */}
        <div className="hidden min-w-0 shrink items-center lg:flex">
          <BoardMenu />
          <span aria-hidden className="text-muted-foreground/60">
            /
          </span>
        </div>
        <CategoryBar />
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        <WorkspaceSwitcher />
        {contributions.topbarItems.map(({ id, pluginId, component: Item }) => (
          // Plugin items may shrink (e.g. a long station name truncates).
          <div key={id} className="flex min-w-0 shrink">
            <PluginBoundary pluginId={pluginId} mode="silent">
              <Item />
            </PluginBoundary>
          </div>
        ))}
        <ThemeMenu />
        <ExportMenu />
      </div>
    </header>
  )
}

function WorkspaceSwitcher() {
  const { contributions } = usePluginRuntime()
  const current = useWorkspace()
  if (contributions.workspaces.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Workspace"
      className="flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5"
    >
      {contributions.workspaces.map((workspace) => {
        const active = workspace.id === current?.id
        return (
          <button
            key={workspace.id}
            type="button"
            aria-pressed={active}
            aria-label={workspace.label}
            title={workspace.label}
            onClick={() => studioState.workspace.set(workspace.id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-background text-foreground shadow-xs"
            )}
          >
            <Icon icon={workspace.icon} className="size-3.5" />
            <span className="hidden xl:inline">{workspace.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The board's file: its name (with an unsaved-changes dot), and new / open / save. */
function BoardMenu() {
  const editor = useEditor()
  const name = useValue(studioState.boardName)
  const dirty = useValue(studioState.boardDirty)
  const recents = useValue(recentBoards)
  const shortcut = (kbd: string) => (
    <span className="ml-auto text-[10.5px] tracking-wide text-muted-foreground">
      {formatKbd(kbd).join("")}
    </span>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="max-w-64 gap-1.5 font-normal"
            aria-label={`Board: ${name}${dirty ? ", unsaved changes" : ""}`}
          >
            <span className="truncate text-muted-foreground">{name}</span>
            {dirty ? (
              <span
                aria-hidden
                title="Unsaved changes"
                className="size-1.5 shrink-0 rounded-full bg-primary"
              />
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="center" className="w-60">
        <DropdownMenuItem onClick={() => void newBoard(editor)}>
          <Icon icon={FileAddIcon} />
          New board
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openBoard(editor)}>
          <Icon icon={FolderOpenIcon} />
          Open…
          {shortcut("cmd+o")}
        </DropdownMenuItem>
        {supportsFileAccess() && recents.length ? (
          <>
            <DropdownMenuSeparator />
            {/* Base UI menu labels must sit inside a group (they label it). */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recent boards</DropdownMenuLabel>
              {recents.slice(0, 6).map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onClick={() => void openRecent(editor, entry)}
                >
                  <Icon icon={Clock01Icon} />
                  <span className="truncate">{entry.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void saveBoard(editor)}>
          <Icon icon={FloppyDiskIcon} />
          Save
          {shortcut("cmd+s")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void saveBoard(editor, { as: true })}>
          <Icon icon={FloppyDiskIcon} />
          Save as…
          {shortcut("cmd+shift+s")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The board's pages, Illustrator-artboard style: switch, add, see where you are. */
function ThemeMenu() {
  const { theme = "system", setTheme } = useTheme()
  const icon =
    theme === "dark" ? Moon02Icon : theme === "light" ? Sun03Icon : ComputerIcon
  return (
    <DropdownMenu>
      <Tip label="Theme" side="bottom">
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Theme" />}
        >
          <Icon icon={icon} />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(String(value))}
        >
          <DropdownMenuRadioItem value="light" closeOnClick>
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick>
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ExportMenu() {
  const actions = useActions()
  const items = [
    { id: "export-as-png", label: "Export PNG" },
    { id: "export-as-svg", label: "Export SVG" },
    { id: "copy-as-png", label: "Copy as PNG" },
    { id: "print", label: "Print…" },
  ].filter((item) => actions[item.id])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="gap-1.5 font-semibold" aria-label="Export" />
        }
      >
        <Icon icon={Download01Icon} className="size-3.5" />
        <span className="hidden lg:inline">Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Selection, or the whole page</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => void actions[item.id].onSelect("export-menu")}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
