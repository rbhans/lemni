"use client"

import { useEffect, useMemo, useState } from "react"

import {
  pointKey,
  useDataSources,
  type HistoryBucket,
  type PointRef,
} from "./live-points"

// Point history for widgets. Requests are shared: every chart showing the same point
// over the same window (rounded to its refresh period) reuses one request.

interface Entry {
  promise: Promise<HistoryBucket[]>
  usedAt: number
}

const cache = new Map<string, Entry>()
const MAX_ENTRIES = 300

function request(
  key: string,
  load: () => Promise<HistoryBucket[]>
): Promise<HistoryBucket[]> {
  const hit = cache.get(key)
  if (hit) {
    hit.usedAt = Date.now()
    return hit.promise
  }
  const promise = load()
  cache.set(key, { promise, usedAt: Date.now() })
  // Failures aren't cached, so the next refresh tries again.
  promise.catch(() => cache.delete(key))
  if (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].usedAt - b[1].usedAt
    )
    for (const [k] of oldest.slice(0, cache.size - MAX_ENTRIES)) cache.delete(k)
  }
  return promise
}

export interface HistoryState {
  /** Last loaded buckets; kept while a refresh is in flight so charts don't flash. */
  buckets: HistoryBucket[] | null
  /** End of the loaded window; live values after it extend the line. */
  end: number | null
  loading: boolean
  error: string | null
  /** No connected source can answer for this point. */
  offline: boolean
}

export { pointKey }

interface Loaded {
  /** The window request that produced this result. */
  window: string
  buckets: HistoryBucket[] | null
  end: number | null
  error: string | null
}

const windowKey = (id: string, start: number, end: number, buckets: number) =>
  [id, start, end, buckets].join("\n")

/**
 * History for each point over the window `[now − spanMs, now]`, split into about
 * `buckets` buckets and reloaded every `refreshMs` (the window end snaps to that
 * period). Keyed by `pointKey`.
 */
export function usePointHistories(
  refs: readonly PointRef[],
  spanMs: number,
  buckets: number,
  refreshMs: number
): ReadonlyMap<string, HistoryState> {
  const sources = useDataSources()
  const [now, setNow] = useState(() => Date.now())
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      Math.min(refreshMs, 30_000)
    )
    return () => clearInterval(timer)
  }, [refreshMs])

  const end = Math.floor(now / refreshMs) * refreshMs
  const start = end - spanMs

  // Stable identity for the list, so a re-render with the same points doesn't refetch.
  const refsKey = refs.map(pointKey).join("\n\n")
  const list = useMemo(
    () =>
      refsKey
        ? refsKey.split("\n\n").map((id) => {
            const [source, point] = id.split("\n")
            return { id, source, point }
          })
        : [],
    [refsKey]
  )

  useEffect(() => {
    let cancelled = false
    for (const ref of list) {
      const source = sources.find((s) => s.id === ref.source)
      if (!source?.history) continue
      const window = windowKey(ref.id, start, end, buckets)
      request(window, () => source.history!(ref.point, { start, end, buckets }))
        .then((result) => {
          if (cancelled) return
          setLoaded((prev) => ({
            ...prev,
            [ref.id]: { window, buckets: result, end, error: null },
          }))
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setLoaded((prev) => ({
            ...prev,
            [ref.id]: {
              window,
              buckets: prev[ref.id]?.buckets ?? null,
              end: prev[ref.id]?.end ?? null,
              error: error instanceof Error ? error.message : "History failed.",
            },
          }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [list, sources, start, end, buckets])

  return useMemo(() => {
    const out = new Map<string, HistoryState>()
    for (const ref of list) {
      const online = sources.some((s) => s.id === ref.source && s.history)
      const state = loaded[ref.id]
      out.set(ref.id, {
        buckets: state?.buckets ?? null,
        end: state?.end ?? null,
        loading:
          online &&
          (!state || state.window !== windowKey(ref.id, start, end, buckets)),
        error: online ? (state?.error ?? null) : null,
        offline: !online,
      })
    }
    return out
  }, [list, sources, loaded, start, end, buckets])
}
