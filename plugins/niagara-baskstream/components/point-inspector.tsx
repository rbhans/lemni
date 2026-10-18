"use client"

import { useEffect, useState } from "react"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useValue } from "tldraw"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Icon } from "@/sdk"

import type { HistoryBucket, PointDetails } from "../shared"
import { stationApi } from "../client/api"
import { connection } from "../client/store"
import { selectedOrd } from "../client/tree-state"
import { STATUS_LABEL, STATUS_TONE, timeAgo, useStationValue } from "./bits"

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function kindLabel(point: PointDetails) {
  const type = point.typeSpec.toLowerCase()
  const base = type.includes("boolean")
    ? "Boolean"
    : type.includes("enum")
      ? "Enum"
      : type.includes("string")
        ? "String"
        : "Numeric"
  return point.writable ? `${base} · writable` : base
}

export function PointInspector() {
  const ord = useValue(selectedOrd)
  const connectionId = useValue(
    "connection id",
    () => connection.get()?.id ?? null,
    []
  )
  const [details, setDetails] = useState<{
    ord: string
    point?: PointDetails
    history?: HistoryBucket[]
    error?: string
  } | null>(null)
  const value = useStationValue(ord)
  const now = useNow()

  useEffect(() => {
    if (!ord || !connectionId) return
    let cancelled = false
    void (async () => {
      try {
        const { point } = await stationApi.describe(connectionId, ord)
        if (cancelled) return
        setDetails({ ord, point })
        if (point.hasHistory) {
          const { buckets } = await stationApi.history(connectionId, ord, 24)
          if (!cancelled) setDetails({ ord, point, history: buckets })
        }
      } catch (error) {
        if (!cancelled)
          setDetails({
            ord,
            error:
              error instanceof Error
                ? error.message
                : "Couldn't load this point.",
          })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ord, connectionId])

  if (!ord) {
    return (
      <p className="px-3 py-4 text-[11.5px] text-muted-foreground">
        Select a point to see its value, status and history.
      </p>
    )
  }

  const current = details?.ord === ord ? details : null
  const point = current?.point

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {point?.name ?? ord.split("/").pop()}
        </span>
        {point ? (
          <Badge
            variant="secondary"
            className="h-[18px] px-1.5 text-[10.5px] font-normal"
          >
            {kindLabel(point)}
          </Badge>
        ) : null}
      </div>
      {point && point.display !== point.name ? (
        <div className="-mt-1.5 text-[11.5px] text-muted-foreground">
          {point.display}
        </div>
      ) : null}
      {current?.error ? (
        <p className="text-[11.5px] text-destructive">{current.error}</p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "text-[22px] leading-7 font-semibold tracking-tight",
            value ? STATUS_TONE[value.statusKind] : "text-muted-foreground"
          )}
        >
          {value?.display ?? "…"}
        </span>
        {value ? (
          <span
            className={cn(
              "rounded px-1.5 font-mono text-[10.5px] leading-[18px]",
              value.statusKind === "ok"
                ? "bg-primary/20 text-foreground"
                : "bg-muted",
              STATUS_TONE[value.statusKind]
            )}
            title={STATUS_LABEL[value.statusKind]}
          >
            {value.status}
          </span>
        ) : null}
        {value?.timestamp ? (
          <span className="text-[11px] text-muted-foreground">
            {timeAgo(value.timestamp, now)}
          </span>
        ) : null}
      </div>

      {point?.hasHistory ? <Sparkline buckets={current?.history} /> : null}

      <div className="flex items-center gap-1.5">
        <code
          className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground"
          title={ord}
        >
          {ord}
        </code>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy ORD"
          onClick={() => {
            void navigator.clipboard
              .writeText(ord)
              .then(() => toast.success("ORD copied"))
          }}
        >
          <Icon icon={Copy01Icon} className="size-3" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Drag points onto shapes to add behaviors (coming with the Behaviors
        plugin).
      </p>
    </div>
  )
}

function Sparkline({ buckets }: { buckets?: HistoryBucket[] }) {
  const width = 252
  const height = 36
  if (!buckets) return <div className="h-9 animate-pulse rounded bg-muted/60" />
  const values = buckets.filter((b) => b.avg !== null)
  if (values.length < 2)
    return (
      <p className="text-[11px] text-muted-foreground">
        No history in the last 24 h.
      </p>
    )

  const min = Math.min(...values.map((b) => b.avg!))
  const max = Math.max(...values.map((b) => b.avg!))
  const span = max - min || 1
  const t0 = values[0].t
  const t1 = values[values.length - 1].t || t0 + 1
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * width
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)
  const path = values
    .map(
      (b, i) => `${i ? "L" : "M"}${x(b.t).toFixed(1)} ${y(b.avg!).toFixed(1)}`
    )
    .join(" ")
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))

  return (
    <div className="flex flex-col gap-0.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-9 w-full"
        role="img"
        aria-label="Last 24 hours"
      >
        <path
          d={path}
          fill="none"
          className="stroke-cyan-600 dark:stroke-cyan-400"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>24 h</span>
        <span>
          min {fmt(min)} · max {fmt(max)}
        </span>
        <span>now</span>
      </div>
    </div>
  )
}
