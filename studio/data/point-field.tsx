"use client"

import { useEffect, useMemo, useState } from "react"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"

import {
  POINT_DRAG_TYPE,
  readPointDrag,
  useDataSources,
  useLivePoint,
  type PointKind,
  type PointOption,
  type PointRef,
} from "./live-points"

const TONE: Record<string, string> = {
  override: "text-amber-700 dark:text-amber-400",
  alarm: "text-destructive",
  fault: "text-orange-700 dark:text-orange-400",
  down: "text-orange-700 dark:text-orange-400",
  stale: "text-muted-foreground",
}

export function LiveValueBadge({
  pointRef,
  className,
}: {
  pointRef: PointRef | null
  className?: string
}) {
  const value = useLivePoint(pointRef)
  if (!pointRef) return null
  if (!value)
    return (
      <span
        className={cn("font-mono text-[11px] text-muted-foreground", className)}
      >
        —
      </span>
    )
  return (
    <span
      className={cn(
        "font-mono text-[11px] whitespace-nowrap",
        TONE[value.statusKind],
        className
      )}
      title={value.status}
    >
      {value.display}
    </span>
  )
}

export function pointName(ref: PointRef) {
  return ref.label ?? ref.point.split("/").pop() ?? ref.point
}

// Shared point picker for anything that binds to live data (behaviors, charts, tables).

/**
 * Chooses a point: search any connected source, or drop one from the Station panel.
 * Shows the remembered name and live value even while editing offline.
 */
export function PointField({
  value,
  onChange,
  placeholder = "Choose a point",
  compact,
}: {
  value: PointRef | null
  onChange(ref: PointRef, kind: PointKind | null): void
  placeholder?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(POINT_DRAG_TYPE)) return
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              setDragOver(false)
              const data = readPointDrag(event.dataTransfer)
              if (!data) return
              event.preventDefault()
              onChange(
                { source: data.source, point: data.point, label: data.label },
                data.kind
              )
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-muted/40 px-2 text-left text-xs hover:bg-muted",
              compact ? "h-7" : "h-8",
              dragOver && "border-ring bg-primary/15"
            )}
          />
        }
      >
        {value ? (
          <>
            <span className="truncate font-mono text-[11.5px]">
              {pointName(value)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
              {compact
                ? ""
                : value.point
                    .replace(/^slot:\//, "")
                    .split("/")
                    .slice(-3, -1)
                    .join("/")}
            </span>
            <LiveValueBadge pointRef={value} />
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <PointSearch
          onPick={(option, source) => {
            onChange(
              { source, point: option.point, label: option.label },
              option.kind
            )
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function PointSearch({
  onPick,
}: {
  onPick(option: PointOption, source: string): void
}) {
  const all = useDataSources()
  const sources = useMemo(() => all.filter((source) => source.search), [all])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{
    query: string
    items: { option: PointOption; source: string }[]
    error?: string
  } | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const timer = setTimeout(() => {
      Promise.all(
        sources.map(async (source) =>
          (await source.search!(q)).map((option) => ({
            option,
            source: source.id,
          }))
        )
      )
        .then((lists) =>
          setResults({ query: q, items: lists.flat().slice(0, 60) })
        )
        .catch((error) =>
          setResults({
            query: q,
            items: [],
            error: error instanceof Error ? error.message : "Search failed.",
          })
        )
    }, 250)
    return () => clearTimeout(timer)
  }, [query, sources])

  if (!sources.length) {
    return (
      <p className="px-1 py-2 text-[11.5px] text-muted-foreground">
        Connect a station to choose points. Saved points keep working offline.
      </p>
    )
  }

  const q = query.trim()
  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <Icon icon={Search01Icon} className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          aria-label="Search points"
          placeholder="Search points (e.g. DA-T, fan status)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <InputGroupAddon align="inline-end">
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon icon={Cancel01Icon} className="size-3" />
            </button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <div className="max-h-64 overflow-y-auto">
        {q.length < 2 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            Type two or more characters, or drag a point from the Station panel
            onto the field.
          </p>
        ) : !results || results.query !== q ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            Searching…
          </p>
        ) : results.error ? (
          <p className="px-1 py-2 text-[11px] text-destructive">
            {results.error}
          </p>
        ) : !results.items.length ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            No points match.
          </p>
        ) : (
          <ul className="flex flex-col">
            {results.items.map(({ option, source }) => (
              <li key={`${source}|${option.point}`}>
                <button
                  type="button"
                  onClick={() => onPick(option, source)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-[11.5px]">
                      {option.label}
                    </span>
                    <span className="truncate text-[10.5px] text-muted-foreground">
                      {option.path}
                    </span>
                  </span>
                  <LiveValueBadge pointRef={{ source, point: option.point }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
