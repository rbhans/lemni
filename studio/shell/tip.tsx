"use client"

import type { ReactElement } from "react"

import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { formatKbd } from "../lib/kbd"

/** Tooltip with an optional shortcut, wrapping any focusable trigger element. */
export function Tip({
  label,
  kbd,
  side = "top",
  children,
}: {
  label: string
  kbd?: string
  side?: "top" | "bottom" | "left" | "right"
  children: ReactElement
}) {
  const keys = formatKbd(kbd)
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {keys.length ? (
          <KbdGroup>
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
