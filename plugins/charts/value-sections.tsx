"use client"

import { useEditor, useValue, type Editor } from "tldraw"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { PointField, PropertyRow, Segmented } from "@/sdk"

import {
  GAUGE_SIZE,
  GAUGE_TYPE,
  isGaugeShape,
  type GaugeShape,
  type GaugeShapeProps,
  type GaugeStyle,
} from "./gauge-shape"
import { RANGES, type ChartRange } from "./model"
import {
  isStatShape,
  STAT_TYPE,
  type StatShape,
  type StatShapeProps,
} from "./stat-shape"
import type { UpIs } from "./value-model"
import { setGaugePoint, setStatPoint } from "./value-points"

export const hasStatSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isStatShape)
export const hasGaugeSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isGaugeShape)

function TitleField({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string
  value: string
  placeholder: string
  onCommit(value: string): void
}) {
  return (
    <PropertyRow label="Title">
      <Input
        key={id}
        aria-label="Title"
        className="h-7 text-xs"
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => {
          if (event.target.value !== value) onCommit(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </PropertyRow>
  )
}

/** A number box that commits on blur or Enter; empty means "none" when allowed. */
function NumberBox({
  label,
  value,
  allowEmpty,
  onCommit,
}: {
  label: string
  value: number | null
  allowEmpty?: boolean
  onCommit(value: number | null): void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        key={String(value)}
        inputMode="decimal"
        aria-label={label}
        className="h-7 font-mono text-xs"
        defaultValue={value === null ? "" : String(value)}
        placeholder={allowEmpty ? "None" : ""}
        onBlur={(event) => {
          const text = event.target.value.trim()
          if (!text) {
            if (allowEmpty && value !== null) onCommit(null)
            else if (!allowEmpty) event.target.value = String(value ?? "")
            return
          }
          const next = Number(text)
          if (!Number.isFinite(next)) {
            event.target.value = value === null ? "" : String(value)
            return
          }
          if (next !== value) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function useOnly<S>(is: (shape: unknown) => shape is S) {
  const editor = useEditor()
  return useValue(
    "only selected widget",
    () => {
      const selected = editor.getSelectedShapes()
      return selected.length === 1 && is(selected[0]) ? selected[0] : null
    },
    [editor]
  )
}

export function StatSection() {
  const editor = useEditor()
  const stat = useOnly(isStatShape as (s: unknown) => s is StatShape)
  if (!stat) return null
  const update = (props: Partial<StatShapeProps>) => {
    editor.markHistoryStoppingPoint("change stat tile")
    editor.updateShape({ id: stat.id, type: STAT_TYPE, props })
  }
  const p = stat.props
  return (
    <div className="flex flex-col gap-2">
      <TitleField
        id={stat.id}
        value={p.title}
        placeholder={p.label || "Point name"}
        onCommit={(title) => update({ title })}
      />
      <PropertyRow label="Point">
        <PointField
          value={
            p.point
              ? { source: p.source, point: p.point, label: p.label }
              : null
          }
          compact
          onChange={(ref, kind) => {
            setStatPoint(editor, stat, ref, kind)
            editor.focus()
          }}
        />
      </PropertyRow>
      <PropertyRow label="Window">
        <Segmented<ChartRange>
          label="Window for the change and sparkline"
          value={p.range}
          options={RANGES.map((r) => ({ value: r.id, label: r.short }))}
          onChange={(range) => {
            update({ range })
            editor.focus()
          }}
        />
      </PropertyRow>
      {p.kind === "number" ? (
        <PropertyRow label="Up is">
          <Segmented<UpIs>
            label="Which way is good"
            value={p.upIs}
            options={[
              { value: "neutral", label: "Neutral" },
              { value: "good", label: "Good" },
              { value: "bad", label: "Bad" },
            ]}
            onChange={(upIs) => {
              update({ upIs })
              editor.focus()
            }}
          />
        </PropertyRow>
      ) : null}
    </div>
  )
}

export function GaugeSection() {
  const editor = useEditor()
  const gauge = useOnly(isGaugeShape as (s: unknown) => s is GaugeShape)
  if (!gauge) return null
  const update = (props: Partial<GaugeShapeProps>) => {
    editor.markHistoryStoppingPoint("change gauge")
    editor.updateShape({ id: gauge.id, type: GAUGE_TYPE, props })
  }
  const p = gauge.props
  const setScale = (min: number, max: number) => {
    if (!(max > min)) {
      toast.info("The top of the scale must be above the bottom.")
      return
    }
    update({ min, max })
  }
  return (
    <div className="flex flex-col gap-2">
      <TitleField
        id={gauge.id}
        value={p.title}
        placeholder={p.label || "Point name"}
        onCommit={(title) => update({ title })}
      />
      <PropertyRow label="Point">
        <PointField
          value={
            p.point
              ? { source: p.source, point: p.point, label: p.label }
              : null
          }
          compact
          onChange={(ref, kind) => {
            setGaugePoint(editor, gauge, ref, kind)
            editor.focus()
          }}
        />
      </PropertyRow>
      <PropertyRow label="Style">
        <Segmented<GaugeStyle>
          label="Gauge style"
          value={p.style}
          options={[
            { value: "dial", label: "Dial" },
            { value: "bar", label: "Bar" },
          ]}
          onChange={(style) => {
            if (style !== p.style)
              update({
                style,
                h: GAUGE_SIZE[style].h,
                w: Math.max(p.w, GAUGE_SIZE[style].w),
              })
            editor.focus()
          }}
        />
      </PropertyRow>
      <div className="grid grid-cols-2 gap-2">
        <NumberBox
          label="Scale from"
          value={p.min}
          onCommit={(v) => v !== null && setScale(v, p.max)}
        />
        <NumberBox
          label="Scale to"
          value={p.max}
          onCommit={(v) => v !== null && setScale(p.min, v)}
        />
        <NumberBox
          label="Low alarm"
          value={p.alarmLow}
          allowEmpty
          onCommit={(alarmLow) => update({ alarmLow })}
        />
        <NumberBox
          label="High alarm"
          value={p.alarmHigh}
          allowEmpty
          onCommit={(alarmHigh) => update({ alarmHigh })}
        />
        <NumberBox
          label="Low warning"
          value={p.warnLow}
          allowEmpty
          onCommit={(warnLow) => update({ warnLow })}
        />
        <NumberBox
          label="High warning"
          value={p.warnHigh}
          allowEmpty
          onCommit={(warnHigh) => update({ warnHigh })}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Past a warning the fill turns amber, past an alarm red. Leave a limit
        empty for none.
      </p>
    </div>
  )
}
