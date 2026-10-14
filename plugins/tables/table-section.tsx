"use client"

import { Cancel01Icon, Download04Icon } from "@hugeicons/core-free-icons"
import { useEditor, useValue, type Editor } from "tldraw"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useLiveValues } from "@/studio/data/live-points"
import { LiveValueBadge, PointField } from "@/studio/data/point-field"
import { PropertyRow, Segmented } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import type { TableColumns, TableLayout } from "./model"
import { addRows, removeRow, tableCsv } from "./table-points"
import {
  isTableShape,
  TABLE_TYPE,
  type TableShape,
  type TableShapeProps,
} from "./table-shape"

export const hasTableSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isTableShape)

const COLUMN_OPTIONS: { key: keyof TableColumns; label: string }[] = [
  { key: "equipment", label: "Equipment" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
]

export function TableSection() {
  const editor = useEditor()
  const tables = useValue(
    "selected tables",
    () => editor.getSelectedShapes().filter(isTableShape),
    [editor]
  )
  if (tables.length !== 1) return null
  return <OneTable table={tables[0]} />
}

function OneTable({ table }: { table: TableShape }) {
  const editor = useEditor()
  const values = useLiveValues(table.props.rows)
  const update = (props: Partial<TableShapeProps>) => {
    editor.markHistoryStoppingPoint("change table")
    editor.updateShape({ id: table.id, type: TABLE_TYPE, props })
  }

  const exportCsv = () => {
    const csv = tableCsv(table, values)
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const name = (table.props.title.trim() || "Points").replace(
      /[\\/:*?"<>|]+/g,
      "-"
    )
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${name}.csv`,
    }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="flex flex-col gap-2">
      <PropertyRow label="Title">
        <Input
          key={table.id}
          aria-label="Table title"
          className="h-7 text-xs"
          defaultValue={table.props.title}
          placeholder={
            table.props.layout === "equipment" ? "Equipment" : "Points"
          }
          onBlur={(event) => {
            if (event.target.value !== table.props.title)
              update({ title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </PropertyRow>
      <PropertyRow label="Layout">
        <Segmented<TableLayout>
          label="Table layout"
          value={table.props.layout}
          options={[
            { value: "list", label: "List" },
            { value: "equipment", label: "By equipment" },
          ]}
          onChange={(layout) => {
            // Sort keys differ between layouts.
            update({ layout, sortBy: "", sortDesc: false })
            editor.focus()
          }}
        />
      </PropertyRow>
      {table.props.layout === "list" ? (
        <PropertyRow label="Columns">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {COLUMN_OPTIONS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-1.5 text-[11.5px]"
              >
                <Checkbox
                  checked={table.props.columns[key]}
                  onCheckedChange={(checked) =>
                    update({
                      columns: {
                        ...table.props.columns,
                        [key]: checked === true,
                      },
                      ...(table.props.sortBy === key && !checked
                        ? { sortBy: "", sortDesc: false }
                        : {}),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </PropertyRow>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Points</span>
          <span>{table.props.rows.length}</span>
        </div>
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {table.props.rows.map((row) => (
            <div
              key={`${row.source}\n${row.point}`}
              className="flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 text-xs hover:bg-muted/50"
              title={row.point}
            >
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <LiveValueBadge pointRef={row} />
              <button
                type="button"
                aria-label={`Remove ${row.label}`}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  removeRow(editor, table, row)
                  editor.focus()
                }}
              >
                <Icon icon={Cancel01Icon} className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <PointField
          value={null}
          compact
          placeholder="Add a point…"
          onChange={(ref) => {
            addRows(editor, table, [ref])
            editor.focus()
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Sort by clicking a column header while the table is selected.
        </p>
      </div>
      <Button
        variant="outline"
        disabled={!table.props.rows.length}
        onClick={exportCsv}
      >
        <Icon icon={Download04Icon} className="size-3.5" />
        Export CSV
      </Button>
    </div>
  )
}
