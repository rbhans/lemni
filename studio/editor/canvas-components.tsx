"use client"

import { forwardRef, type ReactNode } from "react"
import {
  DefaultShapeWrapper,
  type TLEditorComponents,
  type TLShapeWrapperProps,
  useValue,
} from "tldraw"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"

/**
 * tldraw's shape wrapper, with plugin decorators around each shape's content. The
 * outer element keeps tldraw's own transform, size, opacity and culling.
 */
const StudioShapeWrapper = forwardRef<HTMLDivElement, TLShapeWrapperProps>(
  function StudioShapeWrapper(
    { shape, isBackground, children, ...props },
    ref
  ) {
    const { contributions } = usePluginRuntime()
    let content: ReactNode = children
    for (let i = contributions.shapeDecorators.length - 1; i >= 0; i--) {
      const {
        id,
        pluginId,
        component: Decorator,
      } = contributions.shapeDecorators[i]
      const inner = content
      content = (
        <PluginBoundary key={id} pluginId={pluginId} fallback={inner}>
          <Decorator shape={shape} isBackground={isBackground}>
            {inner}
          </Decorator>
        </PluginBoundary>
      )
    }
    return (
      <DefaultShapeWrapper
        ref={ref}
        shape={shape}
        isBackground={isBackground}
        {...props}
      >
        {content}
      </DefaultShapeWrapper>
    )
  }
)

/** Plugin layers drawn in page space, above shapes. */
function StudioOnTheCanvas() {
  const { contributions } = usePluginRuntime()
  return (
    <>
      {contributions.canvasLayers.map(({ id, pluginId, component: Layer }) => (
        <PluginBoundary key={id} pluginId={pluginId} mode="silent">
          <Layer />
        </PluginBoundary>
      ))}
    </>
  )
}

/**
 * tldraw's plain fill, with the chosen plugin background over it (screen space,
 * under the grid). An unknown or disabled choice falls back to the plain fill.
 */
function StudioBackground() {
  const { contributions } = usePluginRuntime()
  const chosen = useValue(
    "canvas background",
    () => studioState.canvasBackground.get(),
    []
  )
  const background = contributions.canvasBackgrounds.find(
    (entry) => entry.id === chosen
  )
  return (
    <div className="tl-background">
      {background ? (
        <PluginBoundary pluginId={background.pluginId} mode="silent">
          <background.component />
        </PluginBoundary>
      ) : null}
    </div>
  )
}

export const canvasComponents: TLEditorComponents = {
  Background: StudioBackground,
  ShapeWrapper: StudioShapeWrapper,
  OnTheCanvas: StudioOnTheCanvas,
}
