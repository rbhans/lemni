"use client"

import { useMemo, useState } from "react"
import { LockIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { dependenciesOf, dependentsOf } from "../plugins/registry"
import { usePluginRuntime } from "../plugins/runtime"
import {
  describeContributions,
  PLUGIN_CATEGORIES,
  type BoardPlugin,
  type PluginCategoryId,
} from "../plugins/types"
import { studioState } from "../state"
import { Icon } from "./icon"

export function PluginManagerDialog() {
  const open = useValue(studioState.pluginManagerOpen)
  const { plugins, enabled } = usePluginRuntime()
  const [category, setCategory] = useState<PluginCategoryId | "all">("all")
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plugins.filter(
      (plugin) =>
        (category === "all" || plugin.category === category) &&
        (!q || `${plugin.name} ${plugin.description}`.toLowerCase().includes(q))
    )
  }, [plugins, category, query])

  const onCount = plugins.filter((plugin) => enabled.has(plugin.id)).length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => studioState.pluginManagerOpen.set(next)}
    >
      <DialogContent className="flex h-[640px] max-h-[calc(100svh-4rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 pt-4 pb-3.5">
          <DialogTitle className="text-base font-semibold">Plugins</DialogTitle>
          <DialogDescription>
            Turn features on or off. Content from a plugin you turn off stays in
            the board and comes back when you turn it on again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Plugin categories"
            className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2"
          >
            <CategoryButton
              label="All plugins"
              count={plugins.length}
              active={category === "all"}
              onClick={() => setCategory("all")}
            />
            {PLUGIN_CATEGORIES.map((entry) => {
              const count = plugins.filter(
                (plugin) => plugin.category === entry.id
              ).length
              if (!count) return null
              return (
                <CategoryButton
                  key={entry.id}
                  label={entry.label}
                  count={count}
                  active={category === entry.id}
                  onClick={() => setCategory(entry.id)}
                />
              )
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="px-4 pt-3 pb-2">
              <InputGroup>
                <InputGroupAddon>
                  <Icon icon={Search01Icon} className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Search plugins"
                  placeholder="Search plugins"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </InputGroup>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ul className="flex flex-col px-4 pb-3">
                {visible.map((plugin) => (
                  <PluginRow key={plugin.id} plugin={plugin} />
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t bg-sidebar px-5 py-3">
          <span className="flex-1 text-xs text-muted-foreground">
            {plugins.length} plugins · {onCount} on
          </span>
          <Button onClick={() => studioState.pluginManagerOpen.set(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CategoryButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center rounded-md px-2.5 text-left text-xs text-foreground/80 hover:bg-muted",
        active && "bg-background font-medium text-foreground shadow-xs"
      )}
    >
      <span className="flex-1">{label}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {count}
      </span>
    </button>
  )
}

function PluginRow({ plugin }: { plugin: BoardPlugin }) {
  const { plugins, enabled, setEnabled } = usePluginRuntime()
  const isOn = enabled.has(plugin.id)
  const nameOf = (id: string) => plugins.find((p) => p.id === id)?.name ?? id
  const requires = dependenciesOf(plugins, plugin.id).map(nameOf)
  const optional = (plugin.optionalDependencies ?? []).map(nameOf)
  const dependents = dependentsOf(plugins, plugin.id)
    .filter((id) => enabled.has(id))
    .map(nameOf)
  const contributes = describeContributions(plugin)

  return (
    <li className="flex gap-3 border-b py-3 last:border-b-0">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80",
          isOn && !plugin.required && "bg-primary/20 text-foreground",
          plugin.stage === "planned" && "opacity-50"
        )}
      >
        <Icon icon={plugin.icon} className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">{plugin.name}</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {plugin.version}
          </span>
          {plugin.stage === "preview" ? (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              Preview
            </Badge>
          ) : null}
          {plugin.stage === "planned" ? (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              Planned
            </Badge>
          ) : null}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          {plugin.description}
        </p>
        {contributes.length ? (
          <div className="flex flex-wrap gap-1">
            {contributes.map((item) => (
              <span
                key={item}
                className="rounded bg-muted px-1.5 text-[10.5px] leading-[18px] text-foreground/80"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {requires.length ? (
          <p className="text-[11px] text-muted-foreground">
            Needs {requires.join(", ")} (turned on with it)
          </p>
        ) : null}
        {optional.length ? (
          <p className="text-[11px] text-muted-foreground">
            Works better with {optional.join(", ")}
          </p>
        ) : null}
        {isOn && dependents.length ? (
          <p className="text-[11px] text-muted-foreground">
            Turning it off also turns off {dependents.join(", ")}
          </p>
        ) : null}
      </div>
      {plugin.required ? (
        <span className="flex h-5 shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Icon icon={LockIcon} className="size-3" />
          Always on
        </span>
      ) : plugin.stage === "planned" ? (
        <span className="h-5 shrink-0 text-[11px] text-muted-foreground">
          Coming soon
        </span>
      ) : (
        <Switch
          aria-label={`${plugin.name} enabled`}
          checked={isOn}
          onCheckedChange={(checked) => setEnabled(plugin.id, checked)}
          className="mt-0.5"
        />
      )}
    </li>
  )
}
