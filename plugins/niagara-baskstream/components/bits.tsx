"use client"

import {
  Calendar03Icon,
  CubeIcon,
  FlowIcon,
  Folder01Icon,
  HashtagIcon,
  LeftToRightListBulletIcon,
  ServerStack01Icon,
  TextFontIcon,
  ToggleOnIcon,
  DashboardSpeed01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { useValue } from "tldraw"

import {
  useLivePoint,
  type LiveValue,
  type StatusKind,
} from "@/studio/data/live-points"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"

import type { StationNode } from "../shared"
import { connection, sourceIdFor } from "../client/store"

export function iconForNode(
  node: Pick<StationNode, "kind" | "typeSpec" | "ord">
): { icon: IconSvgElement; tone: string } {
  const type = node.typeSpec.toLowerCase()
  if (node.kind === "point") {
    if (type.includes("boolean"))
      return { icon: ToggleOnIcon, tone: "text-lime-600 dark:text-lime-400" }
    if (type.includes("enum"))
      return {
        icon: LeftToRightListBulletIcon,
        tone: "text-violet-600 dark:text-violet-400",
      }
    if (type.includes("string"))
      return { icon: TextFontIcon, tone: "text-muted-foreground" }
    if (type.includes("numeric"))
      return { icon: HashtagIcon, tone: "text-cyan-700 dark:text-cyan-400" }
    return { icon: DashboardSpeed01Icon, tone: "text-muted-foreground" }
  }
  if (node.ord === "slot:/" || type.includes("station"))
    return { icon: ServerStack01Icon, tone: "text-foreground/80" }
  if (node.kind === "schedule" || type.includes("schedule"))
    return { icon: Calendar03Icon, tone: "text-muted-foreground" }
  if (type.includes("network"))
    return { icon: FlowIcon, tone: "text-muted-foreground" }
  if (type.includes("device"))
    return { icon: CubeIcon, tone: "text-muted-foreground" }
  return { icon: Folder01Icon, tone: "text-muted-foreground" }
}

/** Point kind for behaviors and the point picker, from the Niagara type. */
export function kindOfNode(
  node: Pick<StationNode, "kind" | "typeSpec">
): "boolean" | "number" | "text" | null {
  if (node.kind !== "point") return null
  const type = node.typeSpec.toLowerCase()
  if (type.includes("boolean")) return "boolean"
  if (type.includes("numeric")) return "number"
  if (type.includes("enum") || type.includes("string")) return "text"
  return null
}

export function NodeIcon({
  node,
  className,
}: {
  node: Pick<StationNode, "kind" | "typeSpec" | "ord">
  className?: string
}) {
  const { icon, tone } = iconForNode(node)
  return <Icon icon={icon} className={cn("size-3.5", tone, className)} />
}

export const STATUS_TONE: Record<StatusKind, string> = {
  ok: "",
  override: "text-amber-700 dark:text-amber-400",
  alarm: "text-destructive",
  fault: "text-orange-700 dark:text-orange-400",
  down: "text-orange-700 dark:text-orange-400",
  stale: "text-muted-foreground",
  disabled: "text-muted-foreground",
  unknown: "text-muted-foreground",
}

export const STATUS_LABEL: Record<StatusKind, string> = {
  ok: "OK",
  override: "Overridden",
  alarm: "In alarm",
  fault: "Fault",
  down: "Down",
  stale: "Stale",
  disabled: "Disabled",
  unknown: "Unknown",
}

/** The live value of a station point, subscribed while mounted. */
export function useStationValue(ord: string | null): LiveValue | undefined {
  const info = useValue(connection)
  return useLivePoint(
    info && ord ? { source: sourceIdFor(info), point: ord } : null
  )
}

export function LiveValueText({
  ord,
  className,
}: {
  ord: string
  className?: string
}) {
  const value = useStationValue(ord)
  if (!value)
    return (
      <span
        className={cn(
          "font-mono text-[11px] text-muted-foreground/60",
          className
        )}
      >
        …
      </span>
    )
  const level = /@\s*(\d+)/.exec(value.status)?.[1]
  return (
    <span
      className={cn(
        "font-mono text-[11px] whitespace-nowrap",
        STATUS_TONE[value.statusKind],
        className
      )}
      title={value.status}
    >
      {value.display}
      {level ? ` @${level}` : ""}
    </span>
  )
}

export function timeAgo(timestamp: number | null, now = Date.now()): string {
  if (!timestamp) return "—"
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
