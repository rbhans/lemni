"use client"

import { useEffect, useState } from "react"
import { AiMagicIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import { useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"
import { studioState } from "@/studio/state"
import { useStudioContext } from "@/studio/studio-context"

import {
  aiAccess,
  aiActivity,
  aiApprovals,
  aiClients,
  aiTouched,
} from "./state"

const RECENT_MS = 10 * 60_000

/** Top bar: which AI app is connected or working, and writes waiting. Opens the AI panel. */
export function AiStatus() {
  const ctx = useStudioContext()
  const access = useValue(aiAccess)
  const clients = useValue(aiClients)
  const waiting = useValue("ai waiting", () => aiApprovals.get().length, [])
  const running = useValue(
    "ai running",
    () => aiActivity.get().find((entry) => entry.status === "running") ?? null,
    []
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const recent = clients.find((client) => now - client.lastSeen < RECENT_MS)
  const label = running?.client ?? recent?.name ?? "AI"
  const tip =
    access === "off"
      ? "AI access is off"
      : running
        ? `${running.client}: ${running.title}`
        : recent
          ? `${recent.name} is connected`
          : "Connect an AI app"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`AI: ${tip}`}
            className="max-w-40 gap-1.5"
            onClick={() => ctx.openPanel("ai")}
          />
        }
      >
        {running ? (
          <Icon
            icon={Loading03Icon}
            className="size-3.5 animate-spin text-primary"
          />
        ) : (
          <Icon
            icon={AiMagicIcon}
            className={cn(
              "size-3.5",
              access === "off"
                ? "text-muted-foreground/50"
                : recent
                  ? "text-primary"
                  : "text-muted-foreground"
            )}
          />
        )}
        <span className="hidden truncate xl:inline">{label}</span>
        {waiting ? (
          <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-medium text-white tabular-nums">
            {waiting}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/** A brief outline around shapes the AI just made or changed. */
export function TouchedLayer() {
  const editor = useEditor()
  const presenting = useValue(studioState.presenting)
  const boxes = useValue(
    "ai touched boxes",
    () => {
      const touched = aiTouched.get()
      const pageId = editor.getCurrentPageId()
      return Object.keys(touched).flatMap((id) => {
        const shape = editor.getShape(id as never)
        if (!shape || editor.getAncestorPageId(shape) !== pageId) return []
        const bounds = editor.getShapePageBounds(shape)
        return bounds
          ? [{ id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }]
          : []
      })
    },
    [editor]
  )
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  if (presenting || !boxes.length) return null
  const pad = 6 / zoom
  return (
    <>
      {boxes.map((box) => (
        <div
          key={box.id}
          aria-hidden
          className="pointer-events-none absolute animate-in rounded-md fade-in"
          style={{
            left: box.x - pad,
            top: box.y - pad,
            width: box.w + pad * 2,
            height: box.h + pad * 2,
            border: `${2 / zoom}px solid var(--primary)`,
            boxShadow: `0 0 ${12 / zoom}px color-mix(in oklab, var(--primary) 45%, transparent)`,
            borderRadius: 6 / zoom,
            zIndex: editor.options.maxShapesPerPage * 4,
          }}
        />
      ))}
    </>
  )
}
