"use client"

import { useValue } from "tldraw"

import { Switch } from "@/components/ui/switch"
import { studioState } from "@/studio/state"

/** Settings → Interface → Panel rail. */
export function RailSettings() {
  const labels = useValue(studioState.railLabels)
  return (
    <label className="flex max-w-96 items-center justify-between gap-3 text-xs">
      <span>
        Show names under the icons
        <span className="block text-[11px] text-muted-foreground">
          Panels are grouped either way: board, connections, then AI.
        </span>
      </span>
      <Switch
        checked={labels}
        onCheckedChange={(checked) => studioState.railLabels.set(checked)}
      />
    </label>
  )
}
