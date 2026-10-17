"use client"

import type { ReactNode } from "react"
import { useEditor, useValue } from "tldraw"

import { Slider } from "@/components/ui/slider"
import { ColorField, SelectField } from "@/studio/shell/fields"
import { studioState } from "@/studio/state"

import { resolveColor } from "./shader-canvas"
import { shaderBackgrounds } from "./shaders"
import {
  backgroundColors,
  backgroundIntensity,
  THEME_COLOR_TOKENS,
  type BackgroundColors,
} from "./state"

export const backgroundChoices = [
  { value: "none", label: "Plain" },
  ...shaderBackgrounds.map(({ id, label }) => ({ value: id, label })),
]

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`

/** Label on the left, control on the right, sized for the Settings dialog. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex max-w-80 min-w-0 flex-1 items-center gap-2">
        {children}
      </div>
    </div>
  )
}

/** Style, intensity and colors for the canvas background (Settings → Canvas). */
export function BackgroundSettings() {
  const editor = useEditor()
  const chosen = useValue(
    "canvas background",
    () => studioState.canvasBackground.get(),
    []
  )
  const intensity = useValue(
    "background intensity",
    () => backgroundIntensity.get(),
    []
  )
  const colors = useValue("background colors", () => backgroundColors.get(), [])
  // Theme colors change with dark mode, so the swatches follow it.
  const dark = useValue("dark mode", () => editor.user.getIsDarkMode(), [
    editor,
  ])
  const plain = chosen === "none"

  const swatch = (key: keyof BackgroundColors) => {
    void dark
    const custom = colors[key]
    if (custom) return custom
    const token = getComputedStyle(document.documentElement).getPropertyValue(
      THEME_COLOR_TOKENS[key]
    )
    return toHex(resolveColor(token, [0, 0, 0]))
  }
  const setColor = (key: keyof BackgroundColors, value: string | null) =>
    backgroundColors.set({ ...backgroundColors.get(), [key]: value })

  const colorRow = (key: keyof BackgroundColors, label: string) => (
    <Row label={label}>
      <ColorField
        label={`Background ${label.toLowerCase()} color`}
        value={swatch(key)}
        onChange={(value) => setColor(key, value)}
      />
      {colors[key] ? (
        <button
          type="button"
          onClick={() => setColor(key, null)}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Theme
        </button>
      ) : null}
    </Row>
  )

  return (
    <div className="flex flex-col gap-2.5">
      <Row label="Style">
        <SelectField
          label="Background style"
          value={chosen}
          options={backgroundChoices}
          onChange={(value) => studioState.canvasBackground.set(value)}
        />
      </Row>
      {plain ? null : (
        <>
          <Row label="Intensity">
            <Slider
              aria-label="Background intensity"
              min={0}
              max={300}
              step={5}
              value={[Math.round(intensity * 100)]}
              onValueChange={(value) =>
                backgroundIntensity.set(
                  (Array.isArray(value) ? value[0] : value) / 100
                )
              }
              className="flex-1"
            />
            <span className="w-9 text-right font-mono text-[11px]">
              {Math.round(intensity * 100)}%
            </span>
          </Row>
          {colorRow("primary", "Color 1")}
          {colorRow("secondary", "Color 2")}
        </>
      )}
    </div>
  )
}
