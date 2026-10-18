"use client"

import { useRef } from "react"
import { useEditor, useValue, type Editor } from "tldraw"

import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { PropertyRow } from "@/sdk"

import { getSymbol, type SymbolFeature, type SymbolState } from "./library"
import { isSymbolShape, type SymbolShape } from "./symbol-shape"

export const hasSymbolSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isSymbolShape)

const SWITCHES: { key: keyof SymbolState & SymbolFeature; label: string }[] = [
  { key: "on", label: "On" },
  { key: "ccw", label: "Reverse rotation" },
  { key: "flow", label: "Flow" },
  { key: "parallel", label: "Parallel blades" },
  { key: "loaded", label: "Dirty filter" },
]

const SLIDERS: { key: keyof SymbolState & SymbolFeature; label: string }[] = [
  { key: "position", label: "Open" },
  { key: "level", label: "Level" },
  { key: "sash", label: "Sash" },
]

/** The designed (saved) look of the selected symbols. Behaviors override it while live. */
export function SymbolSection() {
  const editor = useEditor()
  const symbols = useValue(
    "selected symbols",
    () => editor.getSelectedShapes().filter(isSymbolShape),
    [editor]
  )
  const sliding = useRef(false)
  if (!symbols.length) return null

  const first = symbols[0]
  const pieces = symbols.map((s) => getSymbol(s.props.symbol))
  const features = new Set(pieces.flatMap((piece) => piece?.features ?? []))
  const title =
    symbols.length === 1
      ? (pieces[0]?.title ?? first.props.symbol)
      : `${symbols.length} symbols`

  /** Applies to every selected symbol that has the feature. */
  const update = (
    feature: SymbolFeature,
    patch: Partial<SymbolShape["props"]>,
    mark = true
  ) => {
    if (mark) editor.markHistoryStoppingPoint("change symbol")
    editor.updateShapes(
      symbols
        .filter((s) => getSymbol(s.props.symbol)?.features.includes(feature))
        .map((s) => ({ id: s.id, type: s.type, props: patch }))
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="truncate text-xs font-medium">{title}</p>
      {SWITCHES.filter(({ key }) => features.has(key)).map(({ key, label }) => (
        <label
          key={key}
          className="flex min-h-7 items-center gap-2 text-[11.5px]"
        >
          <Switch
            size="sm"
            checked={Boolean(first.props[key])}
            onCheckedChange={(checked) => update(key, { [key]: checked })}
          />
          {label}
        </label>
      ))}
      {SLIDERS.filter(({ key }) => features.has(key)).map(({ key, label }) => {
        const value = Number(first.props[key])
        return (
          <PropertyRow key={key} label={label}>
            <Slider
              aria-label={label}
              min={0}
              max={100}
              step={1}
              value={[value]}
              onValueChange={(next) => {
                // One undo step per drag.
                update(
                  key,
                  { [key]: Array.isArray(next) ? next[0] : next },
                  !sliding.current
                )
                sliding.current = true
              }}
              onValueCommitted={() => {
                sliding.current = false
              }}
              className="flex-1"
            />
            <span className="w-9 text-right font-mono text-[11px]">
              {Math.round(value)}%
            </span>
          </PropertyRow>
        )
      })}
      {features.has("text") ? (
        <PropertyRow label="Text">
          <Input
            key={first.props.text}
            aria-label="Symbol text"
            className="h-7 text-xs"
            placeholder={pieces[0]?.text}
            defaultValue={first.props.text}
            maxLength={6}
            onBlur={(e) => {
              if (e.target.value !== first.props.text)
                update("text", { text: e.target.value.trim() })
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
        </PropertyRow>
      ) : null}
    </div>
  )
}
