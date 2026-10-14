"use client"

import { useMemo } from "react"
import { useActions, useEditor, useTools } from "tldraw"

import { usePluginRuntime } from "./plugins/runtime"
import type { StudioContext } from "./plugins/types"
import { studioState } from "./state"

/** The context handed to plugin callbacks. Only usable inside the editor scope. */
export function useStudioContext(): StudioContext {
  const editor = useEditor()
  const actions = useActions()
  const tools = useTools()
  const { contributions } = usePluginRuntime()

  return useMemo<StudioContext>(
    () => ({
      editor,
      runAction(id) {
        void actions[id]?.onSelect("menu")
      },
      selectTool(id) {
        tools[id]?.onSelect("toolbar")
        editor.focus()
      },
      setWorkspace(id) {
        studioState.workspace.set(id)
      },
      openPanel(id) {
        const panel = contributions.panels.find(
          (candidate) => candidate.id === id
        )
        if (!panel || panel.side !== "left") return
        const workspace = panel.workspaces.includes(studioState.workspace.get())
          ? studioState.workspace.get()
          : panel.workspaces[0]
        studioState.workspace.set(workspace)
        studioState.leftPanels.update((panels) => ({
          ...panels,
          [workspace]: id,
        }))
      },
      openInspectorTab(id) {
        const current = contributions.workspaces.find(
          (w) => w.id === studioState.workspace.get()
        )
        if (current?.rightPanel !== "inspector")
          studioState.workspace.set("canvas")
        studioState.rightPanelOpen.set(true)
        studioState.inspectorTab.set(id)
      },
    }),
    [editor, actions, tools, contributions.panels, contributions.workspaces]
  )
}
