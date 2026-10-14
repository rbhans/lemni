"use client"

import { forwardRef, type ReactNode } from "react"
import {
  DefaultShapeWrapper,
  type TLEditorComponents,
  type TLShapeWrapperProps,
} from "tldraw"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"

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

export const canvasComponents: TLEditorComponents = {
  ShapeWrapper: StudioShapeWrapper,
  OnTheCanvas: StudioOnTheCanvas,
}
