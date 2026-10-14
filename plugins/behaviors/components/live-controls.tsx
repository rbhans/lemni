"use client"

import { Cancel01Icon, PlayIcon } from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/studio/shell/icon"
import { studioState } from "@/studio/state"

import { liveEffects } from "../runtime/state"

/** Top-right of the canvas: live effects on/off, and Present. */
export function LiveControls() {
  const live = useValue(liveEffects)
  const presenting = useValue(studioState.presenting)

  if (presenting) {
    return (
      <div className="pointer-events-auto absolute top-3 right-3 z-[300]">
        <Button
          variant="outline"
          className="gap-1.5 bg-popover shadow-sm"
          onClick={() => studioState.presenting.set(false)}
        >
          <Icon icon={Cancel01Icon} className="size-3.5" />
          Exit present
          <span className="font-mono text-[10.5px] text-muted-foreground">
            Esc
          </span>
        </Button>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-auto absolute top-3 right-3 z-[300] flex h-8 items-center gap-1 rounded-lg border bg-popover py-0 pr-1 pl-2.5 shadow-sm"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label htmlFor="live-effects" className="text-xs text-foreground/80">
        Live effects
      </label>
      <Switch
        id="live-effects"
        checked={live}
        onCheckedChange={(checked) => liveEffects.set(checked)}
        className="mx-1.5"
      />
      <span aria-hidden className="h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => studioState.presenting.set(true)}
      >
        <Icon icon={PlayIcon} className="size-3.5" />
        Present
      </Button>
    </div>
  )
}
