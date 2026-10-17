"use client"

import {
  Building03Icon,
  CpuIcon,
  Database01Icon,
  Folder01Icon,
  HashtagIcon,
  LeftToRightListBulletIcon,
  ServerStack01Icon,
  ToggleOnIcon,
  DashboardSpeed01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { useValue } from "tldraw"

import { useLivePoint } from "@/studio/data/live-points"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"

import { sourceIdFor } from "../model"
import type { SctNode } from "../shared"
import { sctConnection } from "../client/store"

export function iconForNode(node: Pick<SctNode, "type" | "kind">): {
  icon: IconSvgElement
  tone: string
} {
  if (node.kind === "boolean")
    return { icon: ToggleOnIcon, tone: "text-lime-600 dark:text-lime-400" }
  if (node.kind === "text")
    return {
      icon: LeftToRightListBulletIcon,
      tone: "text-violet-600 dark:text-violet-400",
    }
  if (node.kind === "number")
    return { icon: HashtagIcon, tone: "text-cyan-700 dark:text-cyan-400" }
  switch (node.type) {
    case "archive":
      return { icon: Database01Icon, tone: "text-foreground/80" }
    case "site":
      return { icon: Building03Icon, tone: "text-foreground/80" }
    case "server":
    case "device":
      return { icon: ServerStack01Icon, tone: "text-muted-foreground" }
    case "controller":
    case "integration":
      return { icon: CpuIcon, tone: "text-muted-foreground" }
    case "point":
    case "object":
      return { icon: DashboardSpeed01Icon, tone: "text-muted-foreground" }
    default:
      return { icon: Folder01Icon, tone: "text-muted-foreground" }
  }
}

export function NodeIcon({
  node,
  className,
}: {
  node: Pick<SctNode, "type" | "kind">
  className?: string
}) {
  const { icon, tone } = iconForNode(node)
  return <Icon icon={icon} className={cn("size-3.5", tone, className)} />
}

/** Points carry a kind; other value objects (calendars, loops…) don't drag. */
export const isPoint = (node: SctNode) => node.kind !== null

function useStoredValue(fqr: string) {
  const info = useValue(sctConnection)
  return useLivePoint(
    info ? { source: sourceIdFor(info.database), point: fqr } : null
  )
}

/** Where a stored value came from ("Relinquish default in QAGTemplates"). */
export function StoredFrom({ fqr }: { fqr: string }) {
  const value = useStoredValue(fqr)
  return value ? (
    <span className="truncate text-[11px] text-muted-foreground">
      {value.status}
    </span>
  ) : null
}

/** The value the archive stored for a point. */
export function StoredValueText({
  fqr,
  className,
}: {
  fqr: string
  className?: string
}) {
  const value = useStoredValue(fqr)
  return (
    <span
      className={cn(
        "font-mono text-[11px] whitespace-nowrap",
        !value || value.display === "—" ? "text-muted-foreground/60" : "",
        className
      )}
      title={value?.status}
    >
      {value?.display ?? "…"}
    </span>
  )
}
