"use client"

import { useEffect } from "react"
import { atom, react, useEditor, useValue, type Editor } from "tldraw"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime, type Contributions } from "../plugins/runtime"
import { studioState } from "../state"
import { Inspector, INSPECTOR_WIDTH } from "./inspector"
import { useOpenLeftPanel, useWorkspace } from "./workspace"

export function LeftDock() {
  const panel = useOpenLeftPanel()
  const presenting = useValue(studioState.presenting)
  if (!panel || presenting) return null
  const Panel = panel.component
  return (
    <aside
      aria-label={panel.title}
      className="flex h-full flex-col border-r bg-background"
      style={{ width: panel.width ?? 280 }}
    >
      <PluginBoundary key={panel.id} pluginId={panel.pluginId}>
        <Panel />
      </PluginBoundary>
    </aside>
  )
}

export function RightDock() {
  const workspace = useWorkspace()
  const { contributions } = usePluginRuntime()
  const inspectorOpen = useValue(studioState.rightPanelOpen)
  const presenting = useValue(studioState.presenting)

  if (!workspace?.rightPanel || presenting) return null
  if (workspace.rightPanel === "inspector")
    return inspectorOpen ? <InspectorDock /> : null

  const panel = contributions.panels.find(
    (p) => p.id === workspace.rightPanel && p.side === "right"
  )
  if (!panel) return null
  const Panel = panel.component
  return (
    <aside
      aria-label={panel.title}
      className="flex h-full flex-col border-l bg-background"
      style={{ width: panel.width ?? 300 }}
    >
      <PluginBoundary key={panel.id} pluginId={panel.pluginId}>
        <Panel />
      </PluginBoundary>
    </aside>
  )
}

/**
 * Something to edit: a selection, or a section that applies without one (the next
 * shape's style while drawing, a wire picked on the wire sheet).
 */
function inspectorHasContent(
  editor: Editor,
  sections: Contributions["inspectorSections"]
) {
  return (
    editor.getSelectedShapeIds().length > 0 ||
    sections.some((section) => section.when?.(editor) ?? false)
  )
}

/** Hiding waits a moment, so clicking away then drag-selecting doesn't flicker it. */
const HIDE_DELAY_MS = 220
const SLIDE_MS = 160

const inspectorShown = atom("inspector shown", false)

/** The properties panel, there only while something can be edited. Slides in and out. */
function InspectorDock() {
  const editor = useEditor()
  const { contributions } = usePluginRuntime()
  const shown = useValue(inspectorShown)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const stop = react("inspector content", () => {
      const has = inspectorHasContent(editor, contributions.inspectorSections)
      if (timer) clearTimeout(timer)
      timer = null
      if (has) inspectorShown.set(true)
      else timer = setTimeout(() => inspectorShown.set(false), HIDE_DELAY_MS)
    })
    return () => {
      stop()
      if (timer) clearTimeout(timer)
    }
  }, [editor, contributions.inspectorSections])

  // As the panel comes in, keep what was just selected out from under it. Worked out
  // from the view before the slide (the panel's width is known), so the camera moves
  // with the panel instead of after it.
  useEffect(() => {
    if (!shown) return
    const selection = editor.getSelectionPageBounds()
    if (!selection) return
    const view = editor.getViewportPageBounds()
    const zoom = editor.getZoomLevel()
    const margin = 24 / zoom
    const visibleRight = view.maxX - INSPECTOR_WIDTH / zoom - margin
    const covered = selection.maxX - visibleRight
    // Only for things on screen now, that fit beside the panel.
    const onScreen = selection.minX < view.maxX && selection.maxX > view.minX
    if (covered <= 0 || !onScreen || selection.w > visibleRight - view.minX)
      return
    const camera = editor.getCamera()
    editor.setCamera(
      { x: camera.x - covered, y: camera.y, z: camera.z },
      { animation: { duration: SLIDE_MS + 40 } }
    )
  }, [shown, editor])

  return (
    <div
      className="h-full overflow-hidden transition-[width] ease-out motion-reduce:transition-none"
      style={{
        width: shown ? INSPECTOR_WIDTH : 0,
        transitionDuration: `${SLIDE_MS}ms`,
      }}
      inert={!shown}
      aria-hidden={!shown}
    >
      <Inspector />
    </div>
  )
}
