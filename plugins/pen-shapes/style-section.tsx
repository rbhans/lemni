"use client"

import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  getColorValue,
  useEditor,
  useRelevantStyles,
  useValue,
  type Editor,
  type StyleProp,
} from "tldraw"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { PropertyRow, Segmented } from "@/studio/shell/fields"

const DRAWING_TOOLS = [
  "draw",
  "highlight",
  "geo",
  "arrow",
  "line",
  "text",
  "note",
  "frame",
]

/** Show style controls for the selection, or for the next shape while a drawing tool is active. */
export const hasStyleTarget = (editor: Editor) =>
  editor.getSelectedShapeIds().length > 0 ||
  DRAWING_TOOLS.includes(editor.getCurrentToolId())

function applyStyle<T>(editor: Editor, style: StyleProp<T>, value: T) {
  editor.markHistoryStoppingPoint("change style")
  editor.run(() => {
    if (editor.getSelectedShapeIds().length)
      editor.setStyleForSelectedShapes(style, value)
    editor.setStyleForNextShapes(style, value)
  })
}

function useShared<T>(
  styles: ReturnType<typeof useRelevantStyles>,
  style: StyleProp<T>
) {
  const entry = styles?.get(style)
  if (!entry) return { present: false, value: null as T | null }
  return { present: true, value: entry.type === "shared" ? entry.value : null }
}

export function StyleSection() {
  const editor = useEditor()
  const styles = useRelevantStyles()
  const colors = useValue(
    "theme colors",
    () => editor.getCurrentTheme().colors[editor.getColorMode()],
    [editor]
  )
  const opacity = useValue(
    "opacity",
    () => {
      const shared = editor.getSharedOpacity()
      return shared.type === "shared" ? shared.value : null
    },
    [editor]
  )

  const color = useShared(styles, DefaultColorStyle)
  const fill = useShared(styles, DefaultFillStyle)
  const dash = useShared(styles, DefaultDashStyle)
  const size = useShared(styles, DefaultSizeStyle)

  if (!styles) return null

  return (
    <div className="flex flex-col gap-2">
      {color.present ? (
        <PropertyRow label="Color">
          <div
            role="radiogroup"
            aria-label="Color"
            className="grid flex-1 grid-cols-7 gap-1"
          >
            {DefaultColorStyle.values.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color.value === value}
                aria-label={value.replace("-", " ")}
                title={value.replace("-", " ")}
                onClick={() => applyStyle(editor, DefaultColorStyle, value)}
                className={cn(
                  "size-5 rounded-[5px] border border-black/10 ring-offset-1 ring-offset-background dark:border-white/15",
                  color.value === value && "ring-2 ring-ring"
                )}
                style={{ background: getColorValue(colors, value, "solid") }}
              />
            ))}
          </div>
        </PropertyRow>
      ) : null}
      {fill.present ? (
        <PropertyRow label="Fill">
          <Segmented
            label="Fill"
            value={fill.value}
            onChange={(value) => applyStyle(editor, DefaultFillStyle, value)}
            options={[
              { value: "none", label: "None" },
              { value: "semi", label: "Tint" },
              { value: "solid", label: "Solid" },
              { value: "pattern", label: "Hatch" },
            ]}
          />
        </PropertyRow>
      ) : null}
      {dash.present ? (
        <PropertyRow label="Stroke">
          <Segmented
            label="Stroke"
            value={dash.value}
            onChange={(value) => applyStyle(editor, DefaultDashStyle, value)}
            options={[
              { value: "draw", label: "Pen" },
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dash" },
              { value: "dotted", label: "Dot" },
            ]}
          />
        </PropertyRow>
      ) : null}
      {size.present ? (
        <PropertyRow label="Weight">
          <Segmented
            label="Weight"
            value={size.value}
            onChange={(value) => applyStyle(editor, DefaultSizeStyle, value)}
            options={[
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
              { value: "xl", label: "XL" },
            ]}
          />
        </PropertyRow>
      ) : null}
      <PropertyRow label="Opacity">
        <Slider
          aria-label="Opacity"
          min={0}
          max={100}
          step={5}
          value={[Math.round((opacity ?? 1) * 100)]}
          onValueChange={(value) => {
            const next = (Array.isArray(value) ? value[0] : value) / 100
            if (editor.getSelectedShapeIds().length)
              editor.setOpacityForSelectedShapes(next)
            editor.setOpacityForNextShapes(next)
          }}
          className="flex-1"
        />
        <span className="w-9 text-right font-mono text-[11px]">
          {opacity === null ? "—" : `${Math.round(opacity * 100)}%`}
        </span>
      </PropertyRow>
    </div>
  )
}

export const hasTextStyles = (editor: Editor) => {
  const shapes = editor.getSelectedShapes()
  if (!shapes.length)
    return ["text", "note", "geo"].includes(editor.getCurrentToolId())
  return shapes.some((shape) =>
    ["text", "note", "geo", "arrow", "frame"].includes(shape.type)
  )
}

export function TextSection() {
  const editor = useEditor()
  const styles = useRelevantStyles()
  const font = useShared(styles, DefaultFontStyle)
  const textAlign = useShared(styles, DefaultTextAlignStyle)
  const labelAlign = useShared(styles, DefaultHorizontalAlignStyle)
  if (!styles || !font.present) return null

  return (
    <div className="flex flex-col gap-2">
      <PropertyRow label="Font">
        <Segmented
          label="Font"
          value={font.value}
          onChange={(value) => applyStyle(editor, DefaultFontStyle, value)}
          options={[
            { value: "draw", label: "Hand" },
            { value: "sans", label: "Sans" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Mono" },
          ]}
        />
      </PropertyRow>
      {textAlign.present ? (
        <PropertyRow label="Align">
          <Segmented
            label="Text alignment"
            value={textAlign.value}
            onChange={(value) =>
              applyStyle(editor, DefaultTextAlignStyle, value)
            }
            options={[
              { value: "start", label: "Left" },
              { value: "middle", label: "Center" },
              { value: "end", label: "Right" },
            ]}
          />
        </PropertyRow>
      ) : labelAlign.present ? (
        <PropertyRow label="Align">
          <Segmented
            label="Label alignment"
            value={labelAlign.value}
            onChange={(value) =>
              applyStyle(editor, DefaultHorizontalAlignStyle, value)
            }
            options={[
              { value: "start", label: "Left" },
              { value: "middle", label: "Center" },
              { value: "end", label: "Right" },
            ]}
          />
        </PropertyRow>
      ) : null}
    </div>
  )
}
