"use client"

import { BackgroundIcon } from "@hugeicons/core-free-icons"

import { definePlugin, type CanvasBackgroundContribution } from "@/sdk"

import { BackgroundSettings } from "./background-settings"
import { ShaderCanvas } from "./shader-canvas"
import { shaderBackgrounds } from "./shaders"

const canvasBackgrounds: CanvasBackgroundContribution[] = shaderBackgrounds.map(
  (background, index) => ({
    id: background.id,
    label: background.label,
    order: index,
    component: function Background() {
      return <ShaderCanvas background={background} />
    },
  })
)

export default definePlugin({
  id: "canvas-backgrounds",
  name: "Canvas backgrounds",
  version: "0.1.0",
  description:
    "Animated backgrounds behind the grid that follow the cursor, set up in Settings → Canvas. They stay faint so the dot grid and shapes read first.",
  category: "core",
  icon: BackgroundIcon,
  canvasBackgrounds,
  settingsSections: [
    {
      id: "canvas-background",
      page: "Canvas",
      title: "Background",
      description:
        "An animated layer behind the dot grid that reacts to the cursor and to clicks.",
      order: 10,
      component: BackgroundSettings,
    },
  ],
})
