"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Table01Icon,
} from "@hugeicons/core-free-icons"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingFn,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { useDelaySvgExport, useEditor, useValue } from "tldraw"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  Icon,
  numericValue,
  pointKey,
  useLiveValues,
  type LiveValue,
  type StatusKind,
} from "@/sdk"

import { age, equipmentOf, pivotByEquipment, type TableRowRef } from "./model"
import { TABLE_TYPE, type TableShape } from "./table-shape"

const TITLE_H = 32
const HEAD_H = 28
const ROW_H = 28

const TONE: Partial<Record<StatusKind, string>> = {
  override: "text-amber-700 dark:text-amber-400",
  alarm: "text-destructive",
  fault: "text-orange-700 dark:text-orange-400",
  down: "text-orange-700 dark:text-orange-400",
  stale: "text-muted-foreground",
  disabled: "text-muted-foreground",
}

const DOT: Partial<Record<StatusKind, string>> = {
  ok: "bg-emerald-600 dark:bg-emerald-500",
  override: "bg-amber-500",
  alarm: "bg-destructive",
  fault: "bg-orange-600",
  down: "bg-orange-600",
}

const STATUS_LABEL: Record<StatusKind, string> = {
  ok: "OK",
  alarm: "Alarm",
  fault: "Fault",
  down: "Down",
  stale: "Stale",
  disabled: "Disabled",
  override: "Override",
  unknown: "Unknown",
}

/** Numbers sort by value, text by its display. Missing values are `undefined`, which
 * every column keeps last (`sortUndefined`) whichever way it is sorted. */
const sortValue = (value: LiveValue | undefined) =>
  numericValue(value) ?? value?.display ?? undefined

const byLiveValue: SortingFn<unknown> = (a, b, id) => {
  const x = a.getValue<number | string>(id)
  const y = b.getValue<number | string>(id)
  if (x === y) return 0
  if (typeof x === "number" && typeof y === "number") return x - y
  return String(x).localeCompare(String(y), undefined, { numeric: true })
}

function ValueText({ value }: { value: LiveValue | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn(TONE[value.statusKind])} title={value.status}>
      {value.display}
    </span>
  )
}

function StatusText({ value }: { value: LiveValue | undefined }) {
  if (!value) return null
  const kind = value.statusKind
  // Status color always comes with its label, never alone.
  return (
    <span
      className={cn("flex items-center gap-1.5", TONE[kind])}
      title={value.status}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-muted-foreground/50",
          DOT[kind]
        )}
      />
      {STATUS_LABEL[kind]}
    </span>
  )
}

function useNow(intervalMs: number, on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, on])
  return now
}

interface ListRow {
  id: string
  ref: TableRowRef
  equipment: string
  value: LiveValue | undefined
}

interface PivotRow {
  id: string
  equipment: string
  cells: Record<string, LiveValue | undefined>
}

/**
 * Points with live values. "List" shows one point per row; "By equipment" turns
 * points that share a name into columns, one row per unit.
 */
export function LiveTable({
  shape,
  exporting = false,
}: {
  shape: TableShape
  exporting?: boolean
}) {
  const editor = useEditor()
  const { rows, columns: show, layout, title, sortBy, sortDesc } = shape.props
  const values = useLiveValues(rows)
  const now = useNow(5000, show.updated && layout === "list" && !exporting)
  const interactive = useValue(
    "table sortable",
    () => !exporting && editor.getOnlySelectedShapeId() === shape.id,
    [editor, exporting, shape.id]
  )

  const exportReady = useDelaySvgExport()
  // Values come straight from the live store, so the first render is ready to export.
  useEffect(() => {
    exportReady()
  }, [exportReady])

  const sorting = useMemo<SortingState>(
    () => (sortBy ? [{ id: sortBy, desc: sortDesc }] : []),
    [sortBy, sortDesc]
  )
  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === "function" ? updater(sorting) : updater
    editor.markHistoryStoppingPoint("sort table")
    editor.updateShape({
      id: shape.id,
      type: TABLE_TYPE,
      props: { sortBy: next[0]?.id ?? "", sortDesc: next[0]?.desc ?? false },
    })
  }

  const listData = useMemo<ListRow[]>(
    () =>
      rows.map((ref) => ({
        id: pointKey(ref),
        ref,
        equipment: equipmentOf(ref.point),
        value: values[pointKey(ref)],
      })),
    [rows, values]
  )

  const pivot = useMemo(() => pivotByEquipment(rows), [rows])
  const pivotData = useMemo<PivotRow[]>(
    () =>
      pivot.equipment.map((equipment) => ({
        id: equipment,
        equipment,
        cells: Object.fromEntries(
          pivot.names.map((name) => {
            const ref = pivot.cell(equipment, name)
            return [name, ref ? values[pointKey(ref)] : undefined]
          })
        ),
      })),
    [pivot, values]
  )

  const listColumns = useMemo<ColumnDef<ListRow>[]>(() => {
    const out: ColumnDef<ListRow>[] = [
      {
        id: "name",
        header: "Point",
        accessorFn: (row) => row.ref.label,
        cell: ({ row }) => row.original.ref.label,
      },
    ]
    if (show.equipment)
      out.push({
        id: "equipment",
        header: "Equipment",
        accessorFn: (row) => row.equipment,
        meta: { width: "26%" },
      })
    out.push({
      id: "value",
      header: "Value",
      accessorFn: (row) => sortValue(row.value),
      sortingFn: byLiveValue as SortingFn<ListRow>,
      cell: ({ row }) => <ValueText value={row.original.value} />,
      meta: { width: "24%", numeric: true },
    })
    if (show.status)
      out.push({
        id: "status",
        header: "Status",
        accessorFn: (row) =>
          row.value ? STATUS_LABEL[row.value.statusKind] : undefined,
        cell: ({ row }) => <StatusText value={row.original.value} />,
        meta: { width: "19%" },
      })
    if (show.updated)
      out.push({
        id: "updated",
        header: "Updated",
        accessorFn: (row) => row.value?.timestamp ?? undefined,
        sortingFn: byLiveValue as SortingFn<ListRow>,
        cell: ({ row }) => age(row.original.value?.timestamp ?? null, now),
        meta: { width: "15%", numeric: true },
      })
    return out
  }, [show.equipment, show.status, show.updated, now])

  const pivotColumns = useMemo<ColumnDef<PivotRow>[]>(
    () => [
      {
        id: "equipment",
        header: "Equipment",
        accessorFn: (row) => row.equipment,
        meta: { width: "28%" },
      },
      ...pivot.names.map<ColumnDef<PivotRow>>((name) => ({
        id: `point:${name}`,
        header: name,
        accessorFn: (row) => sortValue(row.cells[name]),
        sortingFn: byLiveValue as SortingFn<PivotRow>,
        cell: ({ row }) => <ValueText value={row.original.cells[name]} />,
        meta: { numeric: true },
      })),
    ],
    [pivot]
  )

  const heading =
    title.trim() || (layout === "equipment" ? "Equipment" : "Points")

  return (
    <div
      className="flex size-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground"
      style={{ pointerEvents: "all" }}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3"
        style={{ height: TITLE_H }}
      >
        <span className="truncate text-xs font-medium">{heading}</span>
        <span className="flex-1" />
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {layout === "equipment"
            ? `${pivot.equipment.length} units`
            : `${rows.length} points`}
        </span>
      </div>
      {rows.length ? (
        layout === "equipment" ? (
          <Grid
            data={pivotData}
            columns={pivotColumns}
            sorting={sorting}
            onSortingChange={onSortingChange}
            interactive={interactive}
            height={shape.props.h}
          />
        ) : (
          <Grid
            data={listData}
            columns={listColumns}
            sorting={sorting}
            onSortingChange={onSortingChange}
            interactive={interactive}
            height={shape.props.h}
          />
        )
      ) : (
        <div className="pointer-events-none mx-3 mb-3 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center">
          <Icon icon={Table01Icon} className="size-5 text-muted-foreground" />
          <p className="text-xs font-medium">Drop points here</p>
          <p className="px-4 text-[11px] text-muted-foreground">
            Drag points from the Station panel onto this table.
          </p>
        </div>
      )}
    </div>
  )
}

interface ColumnMeta {
  width?: string
  numeric?: boolean
}

function Grid<Row extends { id: string }>({
  data,
  columns,
  sorting,
  onSortingChange,
  interactive,
  height,
}: {
  data: Row[]
  columns: ColumnDef<Row>[]
  sorting: SortingState
  onSortingChange(updater: Updater<SortingState>): void
  interactive: boolean
  height: number
}) {
  // TanStack returns fresh functions each render; this component is cheap to re-render.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
    defaultColumn: { sortUndefined: "last" },
  })

  // The table never scrolls inside the canvas (that would fight panning); rows
  // that don't fit are counted instead. Resize the table to show more.
  const all = table.getRowModel().rows
  const fits = Math.max(1, Math.floor((height - TITLE_H - HEAD_H - 2) / ROW_H))
  const shown = all.length > fits ? all.slice(0, fits - 1) : all
  const hidden = all.length - shown.length

  return (
    <Table className="table-fixed text-[11.5px]">
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => {
              const meta = header.column.columnDef.meta as
                ColumnMeta | undefined
              const sorted = header.column.getIsSorted()
              const label: ReactNode = flexRender(
                header.column.columnDef.header,
                header.getContext()
              )
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    "h-7 px-3 text-[11px] font-normal text-muted-foreground",
                    meta?.numeric && "text-right"
                  )}
                  style={{ width: meta?.width }}
                  aria-sort={
                    sorted === "asc"
                      ? "ascending"
                      : sorted === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {interactive ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 hover:text-foreground",
                        sorted && "text-foreground"
                      )}
                      // Sorting is a click, not the start of a drag.
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="truncate">{label}</span>
                      <SortMark sorted={sorted} />
                    </button>
                  ) : (
                    <span className="inline-flex max-w-full items-center gap-1">
                      <span className="truncate">{label}</span>
                      <SortMark sorted={sorted} />
                    </span>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {shown.map((row) => (
          <TableRow key={row.id} className="hover:bg-muted/40">
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta as ColumnMeta | undefined
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "h-7 truncate px-3 py-0",
                    meta?.numeric && "text-right font-mono tabular-nums"
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
        {hidden > 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={columns.length}
              className="h-7 px-3 py-0 text-[11px] text-muted-foreground"
            >
              {hidden} more — resize the table to see them
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function SortMark({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (!sorted) return null
  return (
    <Icon
      icon={sorted === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
      className="size-3 shrink-0"
    />
  )
}
