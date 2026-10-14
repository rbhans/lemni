"use client"

import { useEffect, useState } from "react"
import {
  MoreHorizontalIcon,
  RefreshIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { PanelHeader } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import type { StationNode } from "../shared"
import { stationApi } from "../client/api"
import { connection, disconnect } from "../client/store"
import { loadBranch, selectedOrd } from "../client/tree-state"
import { AlarmsList, useAlarms } from "./alarms-list"
import { LiveValueText, NodeIcon } from "./bits"
import { ConnectForm } from "./connect-form"
import { livePointsLabel } from "./connection-pill"
import { PointInspector } from "./point-inspector"
import { StationTree } from "./station-tree"

export function StationPanel() {
  const info = useValue(connection)
  if (!info) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Station" />
        <ScrollArea className="min-h-0 flex-1 border-t">
          <ConnectForm />
        </ScrollArea>
      </div>
    )
  }
  return <ConnectedPanel />
}

function ConnectedPanel() {
  const info = useValue(connection)!
  const [view, setView] = useState<"tree" | "alarms">("tree")
  const [query, setQuery] = useState("")
  const alarms = useAlarms()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Station">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          onClick={() => void loadBranch("slot:/", true)}
        >
          <Icon icon={RefreshIcon} className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Connection options"
              />
            }
          >
            <Icon icon={MoreHorizontalIcon} className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{info.station}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void disconnect()}
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelHeader>

      <div className="mx-3 mb-2.5 flex flex-col gap-1 rounded-lg border bg-sidebar p-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              info.status === "connected"
                ? "bg-lime-600 dark:bg-lime-400"
                : info.status === "reconnecting"
                  ? "bg-amber-500"
                  : "bg-muted-foreground"
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            {info.name}
          </span>
          <span className="rounded bg-muted px-1.5 text-[10.5px] leading-[18px] text-foreground/80">
            {info.writesEnabled ? "Read · Write" : "Read only"}
          </span>
        </div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">
          {info.station.replace(/^https?:\/\//, "")}
          {info.apiVersion ? ` · API ${info.apiVersion}` : ""}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Signed in as <span className="text-foreground">{info.username}</span>{" "}
          · {livePointsLabel(info.livePoints)}
        </div>
        {info.message ? (
          <div className="text-[11px] text-amber-700 dark:text-amber-400">
            {info.message}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <Icon icon={Search01Icon} className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search the station"
            placeholder="Points, equipment, ORDs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        {query.trim().length < 2 ? (
          <div
            role="group"
            aria-label="Station view"
            className="grid grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5"
          >
            <ViewButton
              active={view === "tree"}
              onClick={() => setView("tree")}
            >
              Tree
            </ViewButton>
            <ViewButton
              active={view === "alarms"}
              onClick={() => setView("alarms")}
            >
              Alarms
              {alarms.alarms?.length ? (
                <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-[10px] leading-4 text-destructive">
                  {alarms.alarms.length}
                </span>
              ) : null}
            </ViewButton>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t">
        {query.trim().length >= 2 ? (
          <SearchResults query={query.trim()} onPick={() => setQuery("")} />
        ) : view === "tree" ? (
          <StationTree />
        ) : (
          <AlarmsList
            alarms={alarms.alarms}
            error={alarms.error}
            onShowPoint={() => setView("tree")}
          />
        )}
      </ScrollArea>

      <section
        aria-label="Point inspector"
        className="max-h-[45%] shrink-0 overflow-y-auto border-t"
      >
        <PointInspector />
      </section>
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 items-center justify-center rounded-[5px] text-[11.5px] font-medium text-muted-foreground hover:text-foreground",
        active && "bg-background text-foreground shadow-xs"
      )}
    >
      {children}
    </button>
  )
}

function SearchResults({ query, onPick }: { query: string; onPick(): void }) {
  const info = useValue(connection)!
  const [result, setResult] = useState<{
    query: string
    nodes?: StationNode[]
    truncated?: boolean
    error?: string
  } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      stationApi
        .search(info.id, query)
        .then((data) => setResult({ query, ...data }))
        .catch((error) =>
          setResult({
            query,
            error: error instanceof Error ? error.message : "Search failed.",
          })
        )
    }, 250)
    return () => clearTimeout(timer)
  }, [info.id, query])

  if (!result || result.query !== query)
    return <p className="px-4 py-6 text-xs text-muted-foreground">Searching…</p>
  if (result.error)
    return <p className="px-4 py-6 text-xs text-destructive">{result.error}</p>
  if (!result.nodes?.length)
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        No matches.
      </p>
    )

  return (
    <ul className="flex flex-col py-1">
      {result.nodes.map((node) => (
        <li key={node.ord}>
          <button
            type="button"
            onClick={() => {
              if (node.kind === "point") selectedOrd.set(node.ord)
              onPick()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
            title={node.ord}
          >
            <NodeIcon node={node} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs">{node.display}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {node.ord.replace(/^slot:\//, "")}
              </span>
            </span>
            {node.kind === "point" ? <LiveValueText ord={node.ord} /> : null}
          </button>
        </li>
      ))}
      {result.truncated ? (
        <li className="px-3 py-2 text-[11px] text-muted-foreground">
          More results exist; refine the search.
        </li>
      ) : null}
    </ul>
  )
}
