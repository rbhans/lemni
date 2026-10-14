"use client"

import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"
import { useStudioContext } from "@/studio/studio-context"

import { connection, disconnect } from "../client/store"

export const livePointsLabel = (count: number) =>
  `${count} live point${count === 1 ? "" : "s"}`

export function ConnectionPill() {
  const info = useValue(connection)
  const { openPanel } = useStudioContext()

  if (!info) {
    return (
      <Button
        variant="outline"
        className="gap-1.5 font-normal text-muted-foreground"
        onClick={() => openPanel("station")}
      >
        <span className="size-[7px] rounded-full bg-muted-foreground/50" />
        No station
      </Button>
    )
  }

  const dot =
    info.status === "connected"
      ? "bg-lime-600 dark:bg-lime-400"
      : info.status === "reconnecting"
        ? "bg-amber-500 animate-pulse"
        : "bg-muted-foreground"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="max-w-56 min-w-0 shrink gap-1.5 font-normal"
          />
        }
      >
        <span className={cn("size-[7px] shrink-0 rounded-full", dot)} />
        <span className="truncate font-medium">{info.name}</span>
        <span className="hidden font-mono text-[11px] text-muted-foreground xl:inline">
          {info.status === "reconnecting" ? "reconnecting" : "live"}
        </span>
        <Icon
          icon={ArrowDown01Icon}
          className="size-3.5 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* Base UI menu labels must sit inside a group (they label it). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground">{info.name}</span>
            <span className="font-mono text-[10.5px]">
              {info.station.replace(/^https?:\/\//, "")} · {info.username}
            </span>
            <span className="text-[10.5px]">
              {info.writesEnabled
                ? "Writes enabled on the station"
                : "Read only"}{" "}
              · {livePointsLabel(info.livePoints)}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openPanel("station")}>
            Open station panel
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void disconnect()}
          >
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LivePointsStatus() {
  const info = useValue(connection)
  if (!info) return null
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          info.status === "connected"
            ? "bg-lime-600 dark:bg-lime-400"
            : "bg-amber-500"
        )}
      />
      <span className="font-mono">{livePointsLabel(info.livePoints)}</span>
    </span>
  )
}
