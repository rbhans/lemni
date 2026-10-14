import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** Thin wrapper so every icon in the studio shares size and stroke defaults. */
export function Icon({
  icon,
  className,
  strokeWidth = 1.6,
}: {
  icon: IconSvgElement
  className?: string
  strokeWidth?: number
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={strokeWidth}
      className={cn("size-4 shrink-0", className)}
      aria-hidden
    />
  )
}
