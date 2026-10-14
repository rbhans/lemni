"use client"

import { useEffect, useState } from "react"
import { useValue } from "tldraw"

import { cn } from "@/lib/utils"

import type { StationAlarm } from "../shared"
import { stationApi } from "../client/api"
import { connection } from "../client/store"
import { reveal } from "../client/tree-state"
import { timeAgo } from "./bits"

function priorityTone(priority: number | null) {
  if (priority === null) return "bg-muted-foreground/40"
  if (priority <= 50) return "bg-destructive"
  if (priority <= 150) return "bg-amber-500"
  return "bg-sky-500"
}

export function useAlarms() {
  const connectionId = useValue(
    "connection id",
    () => connection.get()?.id ?? null,
    []
  )
  const [alarms, setAlarms] = useState<StationAlarm[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!connectionId) return
    let cancelled = false
    const load = () =>
      stationApi.alarms(connectionId).then(
        (result) => {
          if (cancelled) return
          setAlarms(result.alarms)
          setError(null)
        },
        (err: unknown) => {
          if (!cancelled)
            setError(
              err instanceof Error ? err.message : "Couldn't load alarms."
            )
        }
      )
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connectionId, generation])

  return { alarms, error, refresh: () => setGeneration((n) => n + 1) }
}

export function AlarmsList({
  alarms,
  error,
  onShowPoint,
}: {
  alarms: StationAlarm[] | null
  error: string | null
  onShowPoint(): void
}) {
  if (error)
    return <p className="px-4 py-6 text-xs text-destructive">{error}</p>
  if (!alarms)
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">Loading alarms…</p>
    )
  if (!alarms.length)
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        No open alarms.
      </p>
    )

  return (
    <ul className="flex flex-col py-1">
      {alarms.map((alarm) => (
        <li key={alarm.uuid}>
          <button
            type="button"
            disabled={!alarm.source}
            onClick={() => {
              if (!alarm.source) return
              void reveal(alarm.source)
              onShowPoint()
            }}
            className="flex w-full gap-2.5 px-3 py-2 text-left hover:bg-muted disabled:hover:bg-transparent"
          >
            <span
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                priorityTone(alarm.priority)
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs leading-snug">{alarm.message}</span>
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                {alarm.source?.split("/").slice(-3).join("/") ?? "—"}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {alarm.alarmClass ?? "Alarm"} · priority {alarm.priority ?? "—"}{" "}
                ·{" "}
                {alarm.ackState === "unacked"
                  ? "unacknowledged"
                  : (alarm.ackState ?? "")}{" "}
                · {timeAgo(alarm.timestamp)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
