"use client"

import { Fragment } from "react"
import {
  PlusSignIcon,
  PuzzleIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { cn } from "@/lib/utils"

import { usePluginRuntime } from "../plugins/runtime"
import { PANEL_GROUPS, type PanelContribution } from "../plugins/types"
import { openConnect, studioState } from "../state"
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

/** With labels on, each button is a little taller and carries its short name. */
const labelledButton =
  "flex w-11 flex-col items-center gap-1 rounded-md pt-1.5 pb-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"

export function PanelRail() {
  const { contributions } = usePluginRuntime()
  const workspace = useWorkspace()
  const open = useOpenLeftPanel()
  const labels = useValue(studioState.railLabels)
  const panels = workspace ? leftPanelsFor(contributions, workspace.id) : []
  // Board panels, then connections, then AI, with a divider between groups.
  const groups = PANEL_GROUPS.map((group) => ({
    ...group,
    panels: panels.filter((p) => (p.group ?? "board") === group.id),
  })).filter((group) => group.panels.length)

  return (
    <nav
      aria-label="Panels"
      className="flex h-full flex-col items-center gap-1 border-r bg-sidebar py-2"
    >
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? (
            <div aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />
          ) : null}
          <div
            role="group"
            aria-label={group.label}
            className="flex flex-col items-center gap-1"
          >
            {group.panels.map((panel) => {
              const isOpen = open?.id === panel.id
              return (
                <Tip key={panel.id} label={panel.title} side="right">
                  <button
                    type="button"
                    aria-label={panel.title}
                    aria-pressed={isOpen}
                    onClick={() =>
                      workspace &&
                      toggleLeftPanel(workspace.id, panel.id, isOpen)
                    }
                    className={cn(
                      labels ? labelledButton : railButton,
                      isOpen &&
                        "bg-primary/20 text-foreground hover:bg-primary/25"
                    )}
                  >
                    <RailIcon panel={panel} />
                    {labels ? (
                      <span
                        aria-hidden
                        className="w-full truncate px-0.5 text-center text-[9.5px] leading-none"
                      >
                        {panel.railLabel ?? panel.title}
                      </span>
                    ) : null}
                  </button>
                </Tip>
              )
            })}
            {group.id === "connections" &&
            contributions.connectionProbes.length ? (
              <Tip label="Connect…" side="right">
                <button
                  type="button"
                  aria-label="Connect to a station or server"
                  onClick={() => openConnect()}
                  className={labels ? labelledButton : railButton}
                >
                  <Icon icon={PlusSignIcon} className="size-[17px]" />
                  {labels ? (
                    <span
                      aria-hidden
                      className="w-full truncate px-0.5 text-center text-[9.5px] leading-none"
                    >
                      Connect
                    </span>
                  ) : null}
                </button>
              </Tip>
            ) : null}
          </div>
        </Fragment>
      ))}
      <div className="flex-1" />
      <Tip label="Settings" kbd="cmd+comma" side="right">
        <button
          type="button"
          aria-label="Settings"
          onClick={() => studioState.settingsPage.set("")}
          className={railButton}
        >
          <Icon icon={Settings01Icon} className="size-[17px]" />
        </button>
      </Tip>
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

function RailIcon({ panel }: { panel: PanelContribution }) {
  const icon = useValue(
    `rail icon ${panel.id}`,
    () => panel.currentIcon?.get() ?? panel.icon,
    [panel]
  )
  return <Icon icon={icon} className="size-[17px]" />
}
