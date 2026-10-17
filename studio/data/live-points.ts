"use client"

import type { IconSvgElement } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"
import { atom, react, useValue, type Signal } from "tldraw"

// Provider-neutral live data. Connection plugins (Niagara today, others later)
// register a DataSource; behaviors, widgets and the assistant only use this API.

export type StatusKind =
  | "ok"
  | "alarm"
  | "fault"
  | "down"
  | "stale"
  | "disabled"
  | "override"
  | "unknown"

export interface LiveValue {
  ok: boolean
  value: unknown
  /** Formatted for people, units included (e.g. "58.4 °F", "On"). */
  display: string
  status: string
  statusKind: StatusKind
  timestamp: number | null
  units: string | null
}

/** Stable reference to a point: which source, and the point's id within it. */
export interface PointRef {
  source: string
  point: string
  /** Display name remembered for offline editing. */
  label?: string
}

/** One string per point, for maps and React keys. */
export const pointKey = (ref: Pick<PointRef, "source" | "point">) =>
  `${ref.source}\n${ref.point}`

export type PointKind = "boolean" | "number" | "text"

/** A point found by searching a source. */
export interface PointOption {
  point: string
  label: string
  /** Where it lives, for telling similar names apart. */
  path: string
  kind: PointKind | null
}

/** One rollup bucket of a point's history. Booleans roll up as 0–1. */
export interface HistoryBucket {
  /** Bucket start (ms). */
  t: number
  avg: number | null
  min: number | null
  max: number | null
}

export interface HistoryQuery {
  start: number
  end: number
  /** How many buckets to split the span into (the source may return fewer). */
  buckets: number
}

/** How a write changes a point: set its value, override it (optionally for a while), or release it to auto. */
export type WriteAction = "set" | "override" | "auto"

export interface PointWriteRequest {
  point: string
  action: WriteAction
  /** Required for set and override. */
  value?: boolean | number | string
  /** Timed override, in seconds (override only). */
  durationSec?: number
}

/** What a source says a point accepts, before offering a control for it. */
export interface WriteCapability {
  point: string
  writable: boolean
  actions: WriteAction[]
  /** Choices for multistate points, in order. */
  enumOptions: string[]
  supportsDuration: boolean
}

export interface WriteOutcome {
  point: string
  ok: boolean
  error?: string
  /** Read back afterwards (a higher priority may still win). */
  after?: LiveValue
}

/** Who asked and why; sources that keep an audit log record it. */
export interface WriteRequester {
  requestedBy: string
  reason: string
}

export interface DataSource {
  /** Stable across sessions, e.g. "niagara:https://10.0.0.20". Saved in drawings. */
  id: string
  label: string
  /** The connection's icon (`sourceIcon` in studio/shell/source-icon.ts). */
  icon?: IconSvgElement
  /** Declares interest in live values; returns a function that releases it. */
  watch(point: string): () => void
  value(point: string): Signal<LiveValue | undefined>
  /** Finds points by name or path. */
  search?(query: string): Promise<PointOption[]>
  /** Rolled-up history; an empty list when the point keeps none. */
  history?(point: string, query: HistoryQuery): Promise<HistoryBucket[]>
  /** Points inside a folder (equipment, device, network), searched a few levels deep. */
  pointsUnder?(folder: string, limit: number): Promise<PointOption[]>
  /** Shows a point or folder in the source's own panel. */
  reveal?(point: string): void
  /** Whether points can be written, and how. Absent: the source is read only. */
  describeWrite?(points: string[]): Promise<WriteCapability[]>
  /**
   * Writes points. Callers get the person's explicit approval first; the source
   * sends once and never retries.
   */
  write?(
    writes: PointWriteRequest[],
    who: WriteRequester
  ): Promise<WriteOutcome[]>
}

/** Drag-and-drop format for a point (station tree → canvas, behavior editor). */
export const POINT_DRAG_TYPE = "application/x-lemscape-point"

export interface PointDragData {
  source: string
  point: string
  label: string
  kind: PointKind | null
}

/** Drag-and-drop format for a folder of points (equipment, device, network). */
export const FOLDER_DRAG_TYPE = "application/x-lemscape-folder"

export interface FolderDragData {
  source: string
  folder: string
  label: string
}

export function readFolderDrag(
  data: DataTransfer | null
): FolderDragData | null {
  const raw = data?.getData(FOLDER_DRAG_TYPE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FolderDragData>
    if (typeof parsed.source !== "string" || typeof parsed.folder !== "string")
      return null
    return {
      source: parsed.source,
      folder: parsed.folder,
      label: parsed.label ?? parsed.folder,
    }
  } catch {
    return null
  }
}

export function readPointDrag(data: DataTransfer | null): PointDragData | null {
  const raw = data?.getData(POINT_DRAG_TYPE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PointDragData>
    if (typeof parsed.source !== "string" || typeof parsed.point !== "string")
      return null
    return {
      source: parsed.source,
      point: parsed.point,
      label: parsed.label ?? parsed.point,
      kind: parsed.kind ?? null,
    }
  } catch {
    return null
  }
}

/** A live value as a number for plotting: booleans are 0/1, text is not plottable. */
export function numericValue(value: LiveValue | undefined): number | null {
  if (!value?.ok) return null
  if (typeof value.value === "number")
    return Number.isFinite(value.value) ? value.value : null
  if (typeof value.value === "boolean") return value.value ? 1 : 0
  return null
}

/** Infers a point kind from a live value, when the source didn't say. */
export function kindOfValue(value: LiveValue | undefined): PointKind | null {
  if (!value) return null
  if (typeof value.value === "boolean") return "boolean"
  if (typeof value.value === "number") return "number"
  return "text"
}

const sources = atom<Record<string, DataSource>>("data sources", {})

export function registerDataSource(source: DataSource): () => void {
  sources.update((all) => ({ ...all, [source.id]: source }))
  return () =>
    sources.update((all) => {
      if (all[source.id] !== source) return all
      const next = { ...all }
      delete next[source.id]
      return next
    })
}

export function getDataSource(id: string): DataSource | undefined {
  return sources.get()[id]
}

/** Connected sources (not reactive; use `useDataSources` in components). */
export function getDataSources(): DataSource[] {
  return Object.values(sources.get())
}

export function useDataSources(): DataSource[] {
  const all = useValue(sources)
  // Same list until a source connects or disconnects, so it is safe in effect deps.
  return useMemo(() => Object.values(all), [all])
}

/** A source by id, or undefined while it isn't connected. */
export function useDataSource(id: string | undefined): DataSource | undefined {
  return useValue("data source", () => (id ? sources.get()[id] : undefined), [
    id,
  ])
}

/** The live value of a point, subscribed for as long as the caller is mounted. */
export function useLivePoint(ref: PointRef | null): LiveValue | undefined {
  const source = useDataSource(ref?.source)
  const point = ref?.point

  useEffect(() => {
    if (!source || !point) return
    return source.watch(point)
  }, [source, point])

  return useValue(
    "live point",
    () => (source && point ? source.value(point).get() : undefined),
    [source, point]
  )
}

/** Live values for several points, watched while mounted, keyed by `pointKey`. */
export function useLiveValues(
  refs: readonly Pick<PointRef, "source" | "point">[]
): Readonly<Record<string, LiveValue | undefined>> {
  const all = useDataSources()
  const key = refs.map(pointKey).join("\n\n")
  const [values, setValues] = useState<Record<string, LiveValue | undefined>>(
    {}
  )

  useEffect(() => {
    const list = key
      ? key.split("\n\n").map((id) => {
          const [source, point] = id.split("\n")
          return { id, source: all.find((s) => s.id === source), point }
        })
      : []
    const release = list.flatMap((ref) =>
      ref.source ? [ref.source.watch(ref.point)] : []
    )
    const stop = react("live values", () => {
      const next: Record<string, LiveValue | undefined> = {}
      for (const ref of list) next[ref.id] = ref.source?.value(ref.point).get()
      setValues(next)
    })
    return () => {
      stop()
      for (const done of release) done()
    }
  }, [key, all])

  return values
}
