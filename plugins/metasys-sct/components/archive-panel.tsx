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
import { Icon, PanelHeader, POINT_DRAG_TYPE, type PointDragData } from "@/sdk"

import type { SctNode } from "../shared"
import { sctApi } from "../client/api"
import { currentSourceId, disconnect, sctConnection } from "../client/store"
import { loadBranch, revealFqr, ROOT } from "../client/tree-state"
import { ArchiveTree } from "./archive-tree"
import { NodeIcon, StoredValueText } from "./bits"
import { ConnectForm } from "./connect-form"
import { PointDetails } from "./point-details"

export function ArchivePanel() {
  const info = useValue(sctConnection)
  if (!info) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Metasys archive" />
        <ScrollArea className="min-h-0 flex-1 border-t">
          <ConnectForm />
        </ScrollArea>
      </div>
    )
  }
  return <OpenArchive />
}

function OpenArchive() {
  const info = useValue(sctConnection)!
  const [query, setQuery] = useState("")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Metasys archive">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reload the tree"
          onClick={() => void loadBranch(ROOT, true)}
        >
          <Icon icon={RefreshIcon} className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Archive options"
              />
            }
          >
            <Icon icon={MoreHorizontalIcon} className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{info.database}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void disconnect()}
              >
                Close archive
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelHeader>

      <div className="mx-3 mb-2.5 flex flex-col gap-1 rounded-lg border bg-sidebar p-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-sky-600 dark:bg-sky-400" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            {info.archive}
          </span>
          <span className="rounded bg-muted px-1.5 text-[10.5px] leading-[18px] text-foreground/80">
            Offline · Read only
          </span>
        </div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">
          {info.server}:{info.port} · {info.database}
          {info.release ? ` · SCT ${info.release}` : ""}
        </div>
      </div>

      <div className="px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <Icon icon={Search01Icon} className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search the archive"
            placeholder="Points by name or reference"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t">
        {query.trim().length >= 2 ? (
          <SearchResults query={query.trim()} onPick={() => setQuery("")} />
        ) : (
          <ArchiveTree />
        )}
      </ScrollArea>

      <section
        aria-label="Point details"
        className="max-h-[45%] shrink-0 overflow-y-auto border-t"
      >
        <PointDetails />
      </section>
    </div>
  )
}

function SearchResults({ query, onPick }: { query: string; onPick(): void }) {
  const info = useValue(sctConnection)!
  const [result, setResult] = useState<{
    query: string
    nodes?: SctNode[]
    error?: string
  } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      sctApi
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
        <li key={node.id}>
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              const source = currentSourceId()
              if (!source) return event.preventDefault()
              const data: PointDragData = {
                source,
                point: node.fqr,
                label: node.name,
                kind: node.kind,
              }
              event.dataTransfer.setData(POINT_DRAG_TYPE, JSON.stringify(data))
              event.dataTransfer.effectAllowed = "copyLink"
            }}
            onClick={() => {
              void revealFqr(node.fqr)
              onPick()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
            title={node.fqr}
          >
            <NodeIcon node={node} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs">
                {node.name}
                {node.pointType ? (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    {node.pointType}
                  </span>
                ) : null}
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {node.display || node.fqr}
              </span>
            </span>
            <StoredValueText fqr={node.fqr} />
          </button>
        </li>
      ))}
      {result.nodes.length >= 100 ? (
        <li className="px-3 py-2 text-[11px] text-muted-foreground">
          Showing the first 100; refine the search.
        </li>
      ) : null}
    </ul>
  )
}
