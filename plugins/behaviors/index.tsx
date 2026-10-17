"use client"

import { ZapIcon } from "@hugeicons/core-free-icons"

import { registerBehaviorBinder } from "@/studio/editor/behavior-binding"
import { currentPageKind } from "@/studio/pages/page-categories"
import type { BoardPlugin } from "@/studio/plugins/types"
import { studioState } from "@/studio/state"

import { behaviorsAi } from "./ai-tools"
import { BehaviorDecorator } from "./components/behavior-decorator"
import { LabelsLayer } from "./components/labels-layer"
import { LiveControls } from "./components/live-controls"
import { bindPoint } from "./runtime/bind"
import { behaviorPointDrop } from "./runtime/drop"
import { installPresentMode } from "./runtime/present"
import { savedBehaviors } from "./runtime/shapes"
import { liveEffects } from "./runtime/state"
import { BehaviorTab } from "./ui/behavior-tab"

export const behaviors: BoardPlugin = {
  id: "behaviors",
  name: "Behaviors",
  version: "0.1.0",
  description:
    "Drive color, labels, fills, visibility and motion from live points, with test values and click actions.",
  category: "core",
  icon: ZapIcon,
  ai: behaviorsAi,
  stage: "preview",
  inspectorTabs: [
    {
      id: "behavior",
      label: "Behavior",
      order: 20,
      component: BehaviorTab,
      // Behaviors are for graphics, not documents or the wire sheet.
      when: (editor) => currentPageKind(editor) === "ui",
      badge(editor) {
        const ids = editor.getSelectedShapeIds()
        if (ids.length !== 1) return null
        return savedBehaviors(editor.getShape(ids[0])).behaviors.length || null
      },
    },
  ],
  shapeDecorators: [
    { id: "behavior-runtime", order: 10, component: BehaviorDecorator },
  ],
  canvasLayers: [{ id: "behavior-labels", order: 10, component: LabelsLayer }],
  canvasOverlays: [{ id: "live-controls", order: 10, component: LiveControls }],
  commands: [
    {
      id: "present",
      label: "Present",
      group: "Behaviors",
      order: 10,
      kbd: "alt+p",
      keywords: ["presentation", "view", "kiosk", "run"],
      when: () => !studioState.presenting.get(),
      run: () => studioState.presenting.set(true),
    },
    {
      id: "toggle-live-effects",
      label: "Turn live effects on or off",
      group: "Behaviors",
      order: 20,
      keywords: ["behaviors", "animation", "pause", "live"],
      run: () => liveEffects.set(!liveEffects.get()),
    },
  ],
  pointDrops: [behaviorPointDrop],
  pasteOptions: [
    {
      id: "behaviors",
      label: "Behaviors (and their point bindings)",
      order: 10,
      // Behaviors live in the shape's meta; a plain paste leaves them out.
      strip(shape) {
        if (!("behaviors" in shape.meta)) return shape
        const { behaviors: _behaviors, ...meta } = shape.meta
        void _behaviors
        return { ...shape, meta }
      },
    },
  ],
  onEditorMount(ctx) {
    const stopPresent = installPresentMode(ctx.editor)
    const stopBinder = registerBehaviorBinder(bindPoint)
    return () => {
      stopPresent()
      stopBinder()
    }
  },
}
