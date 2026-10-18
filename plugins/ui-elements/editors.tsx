"use client"

import { useMemo, useState } from "react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Delete02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ColorField, Icon, TargetField } from "@/sdk"

import {
  CURATED,
  CURATED_GROUPS,
  iconTitle,
  loadAllIcons,
  useIcon,
} from "./icons"
import { COLOR_PRESETS, type NavLink } from "./model"

/** Theme, a row of presets, and a custom hex. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange(color: string): void
}) {
  const swatch =
    "size-5 shrink-0 rounded-full ring-offset-1 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Theme color"
          aria-pressed={!value}
          title="Theme"
          onClick={() => onChange("")}
          className={cn(
            swatch,
            "border border-dashed border-muted-foreground/60 bg-[conic-gradient(var(--primary)_0_50%,var(--muted)_0)]",
            !value && "ring-2 ring-foreground"
          )}
        />
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-label={preset.label}
            aria-pressed={value === preset.value}
            title={preset.label}
            onClick={() => onChange(preset.value)}
            className={cn(
              swatch,
              value === preset.value && "ring-2 ring-foreground"
            )}
            style={{ background: preset.value }}
          />
        ))}
      </div>
      <ColorField
        label="Custom color"
        value={value || "#7ccf00"}
        onChange={(color) => onChange(color.toLowerCase())}
      />
    </div>
  )
}

function IconButton({
  name,
  icon,
  selected,
  onPick,
}: {
  name: string
  icon: IconSvgElement
  selected: boolean
  onPick(name: string): void
}) {
  return (
    <button
      type="button"
      title={iconTitle(name)}
      aria-label={iconTitle(name)}
      aria-pressed={selected}
      onClick={() => onPick(name)}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-muted hover:text-foreground",
        selected && "bg-primary/20 text-foreground ring-1 ring-primary"
      )}
    >
      <Icon icon={icon} className="size-4" />
    </button>
  )
}

/** Pick an icon: the curated set by group, or search everything (loaded on demand). */
export function IconPicker({
  value,
  onChange,
  compact,
}: {
  value: string
  onChange(name: string): void
  /** Just the icon square, for tight rows (links). */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [all, setAll] = useState<Record<string, IconSvgElement> | null>(null)
  const [loading, setLoading] = useState(false)
  const current = useIcon(value)
  const q = query.trim().toLowerCase().replace(/\s+/g, "")

  // Searching reaches past the curated set, so the whole set loads on first search.
  const search = (text: string) => {
    setQuery(text)
    if (!text.trim() || all || loading) return
    setLoading(true)
    loadAllIcons()
      .then(setAll)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const results = useMemo(() => {
    if (!q) return null
    const pool = all ?? CURATED
    return Object.keys(pool)
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 96)
  }, [q, all])

  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={value ? `Icon: ${iconTitle(value)}` : "Choose an icon"}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border border-input bg-background text-xs hover:bg-muted/40",
              compact ? "w-7 justify-center" : "min-w-0 flex-1 px-2"
            )}
          />
        }
      >
        {current ? (
          <Icon icon={current} className="size-3.5" />
        ) : compact ? (
          <span className="text-[10px] text-muted-foreground">—</span>
        ) : null}
        {compact ? null : (
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? iconTitle(value) : "None"}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Icon
              icon={Search01Icon}
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              aria-label="Search icons"
              placeholder="Search all icons"
              value={query}
              onChange={(event) => search(event.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          {value ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pick("")}
              title="No icon"
            >
              <Icon icon={Cancel01Icon} data-icon="inline-start" />
              None
            </Button>
          ) : null}
        </div>
        <div className="max-h-72 overflow-y-auto pr-1">
          {results ? (
            results.length ? (
              <div className="grid grid-cols-8 gap-0.5">
                {results.map((name) => (
                  <IconButton
                    key={name}
                    name={name}
                    icon={(all ?? CURATED)[name]}
                    selected={name === value}
                    onPick={pick}
                  />
                ))}
              </div>
            ) : (
              <p className="px-1 py-3 text-center text-muted-foreground">
                {loading ? "Loading all icons…" : "No icons match."}
              </p>
            )
          ) : (
            CURATED_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-1 pb-1 text-[10.5px] text-muted-foreground">
                  {group.label}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.names.map((name) => (
                    <IconButton
                      key={name}
                      name={name}
                      icon={CURATED[name]}
                      selected={name === value}
                      onPick={pick}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The entries of a dropdown or nav bar: label, where it goes, an optional icon. */
export function LinksEditor({
  links,
  onChange,
  pickLabel,
}: {
  links: NavLink[]
  onChange(links: NavLink[]): void
  pickLabel(link: NavLink, index: number): string
}) {
  const patch = (i: number, change: Partial<NavLink>) =>
    onChange(links.map((link, j) => (j === i ? { ...link, ...change } : link)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= links.length) return
    const next = [...links]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col rounded-md border">
        {links.map((link, i) => (
          <div
            key={i}
            className={cn("flex flex-col gap-1 p-1.5", i > 0 && "border-t")}
          >
            <div className="flex items-center gap-1">
              <IconPicker
                compact
                value={link.icon}
                onChange={(icon) => patch(i, { icon })}
              />
              <Input
                key={link.label}
                aria-label={`Link ${i + 1} label`}
                className="h-7 min-w-0 flex-1 text-xs"
                defaultValue={link.label}
                placeholder={`Link ${i + 1}`}
                onBlur={(event) => {
                  if (event.target.value !== link.label)
                    patch(i, { label: event.target.value })
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon icon={ArrowUp01Icon} className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move down"
                disabled={i === links.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon icon={ArrowDown01Icon} className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${link.label || `link ${i + 1}`}`}
                onClick={() => onChange(links.filter((_, j) => j !== i))}
              >
                <Icon icon={Delete02Icon} className="size-3" />
              </Button>
            </div>
            <TargetField
              value={link.target}
              pickLabel={pickLabel(link, i)}
              onChange={(target) => patch(i, { target })}
            />
          </div>
        ))}
        {!links.length ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">
            No links yet.
          </p>
        ) : null}
      </div>
    </div>
  )
}
