"use client"

import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { useEditor, useValue, type Editor } from "tldraw"

import { Input } from "@/components/ui/input"
import { LiveValueBadge, PointField } from "@/studio/data/point-field"
import { PropertyRow, Segmented } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import { addSeries, removeSeries } from "./chart-points"
import { CHART_TYPE, isChartShape, type ChartShapeProps } from "./chart-shape"
import { MAX_SERIES, RANGES, type ChartRange } from "./model"

export const hasChartSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isChartShape)

export function ChartSection() {
  const editor = useEditor()
  const charts = useValue(
    "selected charts",
    () => editor.getSelectedShapes().filter(isChartShape),
    [editor]
  )
  if (!charts.length) return null

  const update = (props: Partial<ChartShapeProps>) => {
    editor.markHistoryStoppingPoint("change chart")
    editor.updateShapes(
      charts.map((chart) => ({ id: chart.id, type: CHART_TYPE, props }))
    )
  }

  const first = charts[0]
  const sameRange = charts.every((c) => c.props.range === first.props.range)

  return (
    // `bas-chart` brings the series colors for the point keys.
    <div className="bas-chart flex flex-col gap-2">
      {charts.length === 1 ? (
        <PropertyRow label="Title">
          <Input
            key={first.id}
            aria-label="Chart title"
            className="h-7 text-xs"
            defaultValue={first.props.title}
            placeholder={
              first.props.series.length === 1
                ? first.props.series[0].label
                : "Trend"
            }
            onBlur={(event) => {
              if (event.target.value !== first.props.title)
                update({ title: event.target.value })
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        </PropertyRow>
      ) : null}
      <PropertyRow label="Range">
        <Segmented<ChartRange>
          label="Time range"
          value={sameRange ? first.props.range : null}
          options={RANGES.map((r) => ({ value: r.id, label: r.short }))}
          onChange={(range) => {
            update({ range })
            editor.focus()
          }}
        />
      </PropertyRow>

      {charts.length === 1 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Points</span>
            <span>
              {first.props.series.length} of {MAX_SERIES}
            </span>
          </div>
          {first.props.series.map((s) => (
            <div
              key={`${s.source}\n${s.point}`}
              className="flex h-7 items-center gap-2 rounded-md px-1.5 text-xs hover:bg-muted/50"
              title={s.point}
            >
              <span
                className={
                  s.kind === "boolean"
                    ? "size-2 shrink-0 rounded-[2px]"
                    : "h-0.5 w-3 shrink-0 rounded-full"
                }
                style={{ background: `var(--series-${s.slot})` }}
              />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <LiveValueBadge pointRef={s} />
              <button
                type="button"
                aria-label={`Remove ${s.label}`}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  removeSeries(editor, first, s)
                  editor.focus()
                }}
              >
                <Icon icon={Cancel01Icon} className="size-3" />
              </button>
            </div>
          ))}
          {first.props.series.length < MAX_SERIES ? (
            <PointField
              value={null}
              compact
              placeholder="Add a point…"
              onChange={(ref, kind) => {
                addSeries(editor, first, [{ ...ref, kind }])
                editor.focus()
              }}
            />
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Points with different units get their own pane; on/off points show
            as lanes.
          </p>
        </div>
      ) : null}
    </div>
  )
}
