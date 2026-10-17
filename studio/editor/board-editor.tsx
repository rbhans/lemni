"use client"

import "tldraw/tldraw.css"

import { useMemo, type ReactNode } from "react"
import { useTheme } from "next-themes"
import {
  defaultAddFontsFromNode,
  defaultAssetUtils,
  defaultEditorAssetUrls,
  defaultOverlayUtils,
  TldrawEditor,
  TldrawUiContextProvider,
  tipTapDefaultExtensions,
  useEditorComponents,
  type TldrawOptions,
  type TLShape,
  type TLUiOverrides,
} from "tldraw"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"
import type { ShellSlots } from "../shell/shell-layout"
import { ShellChrome } from "../shell/shell-chrome"
import { ToolDock } from "../shell/tool-dock"
import { boardThemes } from "./board-theme"
import { canvasComponents } from "./canvas-components"
import { CanvasContextMenu } from "./canvas-context-menu"
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  EngineBridge,
} from "./engine-bridge"
import { PasteSpecialDialog, rememberCopy } from "./paste"
import { TargetPickLayer } from "../navigation/target-field"
import { PointDrop } from "./point-drop"

const editorOptions: Partial<TldrawOptions> = {
  text: {
    tipTapConfig: { extensions: tipTapDefaultExtensions },
    addFontsFromNode: defaultAddFontsFromNode,
  },
}

const MEDIA_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES]

/** Hidden shapes (Layers' eye toggle) aren't drawn, hit or exported, but keep their place. */
const shapeVisibility = (shape: TLShape) =>
  (shape.meta as { hidden?: unknown }).hidden === true ? "hidden" : "inherit"

/**
 * tldraw's engine without its UI. The canvas renders here; the studio chrome is
 * rendered inside the same React tree (so it shares editor, action and tool
 * contexts) and portaled into the shell's docked slots.
 */
export function BoardEditor({ slots }: { slots: ShellSlots | null }) {
  const { engine } = usePluginRuntime()

  return (
    <div className="absolute inset-0">
      <TldrawEditor
        initialState="select"
        shapeUtils={engine.shapeUtils}
        bindingUtils={engine.bindingUtils}
        tools={engine.tools}
        assetUtils={defaultAssetUtils}
        overlayUtils={defaultOverlayUtils}
        assetUrls={defaultEditorAssetUrls}
        options={editorOptions}
        themes={boardThemes}
        components={canvasComponents}
        getShapeVisibility={shapeVisibility}
        // Named when the product was BAS Board; changing it would orphan the working copy.
        persistenceKey="basboard-dev-board"
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        onMount={(editor) => {
          editor.updateInstanceState({ isGridMode: true })
          // Handy for poking at the board from devtools; never shipped in production builds.
          if (process.env.NODE_ENV === "development")
            Object.assign(window, { editor })
        }}
        autoFocus
      >
        <EditorScope slots={slots} />
      </TldrawEditor>
    </div>
  )
}

function EditorScope({ slots }: { slots: ShellSlots | null }) {
  const { Canvas } = useEditorComponents()
  const runtime = usePluginRuntime()
  const { setTheme } = useTheme()

  // Tools owned by disabled plugins disappear from tldraw's tool registry,
  // which also removes their keyboard shortcuts.
  const overrides = useMemo<TLUiOverrides>(
    () => ({
      tools(_editor, tools) {
        const next = { ...tools }
        for (const id of runtime.hiddenTldrawTools) delete next[id]
        return next
      },
      actions(editor, actions) {
        // Copies made from menus are remembered for Paste special too.
        const remembering = (id: "copy" | "cut") =>
          actions[id]
            ? {
                [id]: {
                  ...actions[id],
                  onSelect(
                    source: Parameters<typeof actions.copy.onSelect>[0]
                  ) {
                    rememberCopy(editor)
                    return actions[id].onSelect(source)
                  },
                },
              }
            : {}
        // ⌘/ flips the app theme (next-themes owns it), not just the canvas.
        const toggle = actions["toggle-dark-mode"]
        if (!toggle)
          return { ...actions, ...remembering("copy"), ...remembering("cut") }
        return {
          ...actions,
          ...remembering("copy"),
          ...remembering("cut"),
          "toggle-dark-mode": {
            ...toggle,
            onSelect() {
              // The canvas mirrors the app theme, so it knows which way to flip.
              setTheme(editor.user.getIsDarkMode() ? "light" : "dark")
            },
          },
        }
      },
    }),
    [runtime.hiddenTldrawTools, setTheme]
  )

  return (
    <TldrawUiContextProvider overrides={overrides} mediaMimeTypes={MEDIA_TYPES}>
      <EngineBridge />
      {/* The canvas stays outside plugin providers so toggling a plugin never remounts it. */}
      <CanvasContextMenu>{Canvas ? <Canvas /> : null}</CanvasContextMenu>
      <PluginProviders>
        {runtime.contributions.canvasOverlays.map(
          ({ id, pluginId, component: Overlay }) => (
            <PluginBoundary key={id} pluginId={pluginId} mode="silent">
              <Overlay />
            </PluginBoundary>
          )
        )}
        <ToolDock />
        <PointDrop />
        <TargetPickLayer />
        <PasteSpecialDialog />
        {slots ? <ShellChrome slots={slots} /> : null}
      </PluginProviders>
    </TldrawUiContextProvider>
  )
}

function PluginProviders({ children }: { children: ReactNode }) {
  const { active } = usePluginRuntime()
  const providers = active.flatMap((plugin) => plugin.providers ?? [])
  return providers.reduceRight<ReactNode>(
    (inner, Provider) => <Provider>{inner}</Provider>,
    children
  )
}
