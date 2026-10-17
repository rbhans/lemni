"use client"

import { useEffect, useState } from "react"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useValue } from "tldraw"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/studio/shell/icon"

import type { SctPointDetail } from "../shared"
import { sctApi } from "../client/api"
import { sctConnection } from "../client/store"
import { selectedFqr } from "../client/tree-state"
import { NodeIcon, StoredFrom, StoredValueText } from "./bits"

const KIND_LABEL = { number: "Numeric", boolean: "Binary", text: "Multistate" }

/** What the archive knows about the selected item. */
export function PointDetails() {
  const fqr = useValue(selectedFqr)
  const connectionId = useValue(
    "sct connection id",
    () => sctConnection.get()?.id ?? null,
    []
  )
  const [details, setDetails] = useState<{
    fqr: string
    point?: SctPointDetail | null
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!fqr || !connectionId) return
    let cancelled = false
    sctApi
      .describe(connectionId, fqr)
      .then(({ point }) => !cancelled && setDetails({ fqr, point }))
      .catch(
        (error) =>
          !cancelled &&
          setDetails({
            fqr,
            error: error instanceof Error ? error.message : "Couldn't load it.",
          })
      )
    return () => {
      cancelled = true
    }
  }, [fqr, connectionId])

  if (!fqr)
    return (
      <p className="px-3 py-3 text-[11.5px] text-muted-foreground">
        Select a point to see it here. Drag points, controllers or engines onto
        the board.
      </p>
    )
  if (!details || details.fqr !== fqr)
    return <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
  if (details.error)
    return <p className="px-3 py-3 text-xs text-destructive">{details.error}</p>
  const point = details.point
  if (!point)
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        This item isn&apos;t in the archive.
      </p>
    )

  const rows: [string, string | null][] = [
    ["Definition", point.definition],
    ["Description", point.description],
    ["Object", point.objectId],
    ["Engine", point.device],
    ["Path", point.display || null],
  ]

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <NodeIcon node={point} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {point.name}
        </span>
        {point.pointType ? (
          <Badge variant="secondary" className="h-[18px] px-1.5 text-[10.5px]">
            {point.pointType}
            {point.kind ? ` · ${KIND_LABEL[point.kind]}` : ""}
          </Badge>
        ) : null}
      </div>
      {point.kind ? (
        <div className="flex items-baseline gap-2">
          <StoredValueText fqr={point.fqr} className="text-base" />
          <StoredFrom fqr={point.fqr} />
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">
          {point.fqr}
        </code>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy reference"
          onClick={() =>
            void navigator.clipboard
              .writeText(point.fqr)
              .then(() => toast.success("Reference copied"))
          }
        >
          <Icon icon={Copy01Icon} className="size-3" />
        </Button>
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-[11.5px]">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ) : null
        )}
      </dl>
    </div>
  )
}
