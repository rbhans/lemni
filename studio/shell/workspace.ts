"use client"

import { useValue } from "tldraw"

import type { Contributions } from "../plugins/runtime"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"

/** The current workspace, falling back to the first enabled one. */
export function useWorkspace() {
  const { contributions } = usePluginRuntime()
  const id = useValue(studioState.workspace)
  return (
    contributions.workspaces.find((w) => w.id === id) ??
    contributions.workspaces[0] ??
    null
  )
}

export function leftPanelsFor(
  contributions: Contributions,
  workspaceId: string
) {
  return contributions.panels.filter(
    (p) => p.side === "left" && p.workspaces.includes(workspaceId)
  )
}

/** The open left panel for the current workspace, or null when collapsed. */
export function useOpenLeftPanel() {
  const { contributions } = usePluginRuntime()
  const workspace = useWorkspace()
  const choices = useValue(studioState.leftPanels)
  if (!workspace) return null
  const panels = leftPanelsFor(contributions, workspace.id)
  const chosen =
    workspace.id in choices ? choices[workspace.id] : workspace.defaultLeftPanel
  if (chosen === null) return null
  return (
    panels.find((p) => p.id === chosen) ??
    panels.find((p) => p.id === workspace.defaultLeftPanel) ??
    null
  )
}

export function toggleLeftPanel(
  workspaceId: string,
  panelId: string,
  isOpen: boolean
) {
  studioState.leftPanels.update((panels) => ({
    ...panels,
    [workspaceId]: isOpen ? null : panelId,
  }))
}
