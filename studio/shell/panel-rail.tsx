"use client"

import { PuzzleIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"
import { Icon } from "./icon"
import { Tip } from "./tip"
import {
  leftPanelsFor,
  toggleLeftPanel,
  useOpenLeftPanel,
  useWorkspace,
} from "./workspace"

const railButton =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"

export function PanelRail() {
  const { contributions } = usePluginRuntime()
  const workspace = useWorkspace()
  const open = useOpenLeftPanel()
  const panels = workspace ? leftPanelsFor(contributions, workspace.id) : []

  return (
    <nav
      aria-label="Panels"
      className="flex h-full flex-col items-center gap-1 border-r bg-sidebar py-2"
    >
      {panels.map((panel) => {
        const isOpen = open?.id === panel.id
        return (
          <Tip key={panel.id} label={panel.title} side="right">
            <button
              type="button"
              aria-label={panel.title}
              aria-pressed={isOpen}
              onClick={() =>
                workspace && toggleLeftPanel(workspace.id, panel.id, isOpen)
              }
              className={cn(
                railButton,
                isOpen && "bg-primary/20 text-foreground hover:bg-primary/25"
              )}
            >
              <Icon icon={panel.icon} className="size-[17px]" />
            </button>
          </Tip>
        )
      })}
      <div className="flex-1" />
      <Tip label="Plugins" side="right">
        <button
          type="button"
          aria-label="Plugins"
          onClick={() => studioState.pluginManagerOpen.set(true)}
          className={railButton}
        >
          <Icon icon={PuzzleIcon} className="size-[17px]" />
        </button>
      </Tip>
    </nav>
  )
}
