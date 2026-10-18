"use client"

import { useEffect, useState } from "react"
import {
  ArrowDown01Icon,
  MinusSignIcon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue } from "tldraw"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  getDataSource,
  goTo,
  Icon,
  kindOfValue,
  numericValue,
  parseTarget,
  useLivePoint,
  type LiveValue,
} from "@/sdk"

import { useIcon } from "./icons"

import {
  coerceWriteValue,
  contrastText,
  elementLabel,
  hasPoint,
  percentOf,
  snap,
  writesPoint,
  type NavLink,
  type UiElement,
} from "./model"
import { requestWrite } from "./writes"

const TONE: Partial<Record<LiveValue["statusKind"], string>> = {
  override: "text-amber-700 dark:text-amber-400",
  alarm: "text-destructive",
  fault: "text-orange-700 dark:text-orange-400",
  down: "text-orange-700 dark:text-orange-400",
  stale: "text-muted-foreground",
  disabled: "text-muted-foreground",
}

/** A value as text, with the element's on/off words for on/off points. */
function shown(el: UiElement, value: LiveValue | undefined) {
  if (!value) return "—"
  if (typeof value.value === "boolean")
    return value.value ? el.onText : el.offText
  return value.display
}

/** The station's own choices for a multistate point, asked once per point. */
const enumCache = new Map<string, Promise<string[]>>()
function useEnumOptions(el: UiElement) {
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    if (el.kind !== "select" || el.options.length || !hasPoint(el)) return
    const source = getDataSource(el.source)
    if (!source?.describeWrite) return
    const key = `${el.source}\n${el.point}`
    let request = enumCache.get(key)
    if (!request) {
      request = source
        .describeWrite([el.point])
        .then(([info]) => info?.enumOptions ?? [])
        .catch(() => [])
      enumCache.set(key, request)
    }
    let live = true
    void request.then((list) => live && setOptions(list))
    return () => {
      live = false
    }
  }, [el])
  return el.options.length ? el.options : options
}

/**
 * The element's accent as the theme's primary color, so every shadcn part that uses
 * primary (button fill, switch track, slider range, progress bar, badge) takes it.
 */
export function accentStyle(color: string): React.CSSProperties | undefined {
  if (!color) return undefined
  return {
    "--primary": color,
    "--primary-foreground": contrastText(color),
    "--ring": color,
  } as React.CSSProperties
}

/**
 * One UI element. `interactive` only in Present mode; on the board it's a shape like
 * any other. `row` lays it out as one line of a panel.
 */
export function ElementView(props: {
  el: UiElement
  interactive: boolean
  row?: boolean
}) {
  const style = accentStyle(props.el.color)
  if (!style) return <ElementControl {...props} />
  return (
    <div className={props.row ? "contents" : "size-full"} style={style}>
      <ElementControl {...props} />
    </div>
  )
}

/** An icon by its stored name (curated ones at once; others once the full set loads). */
function NamedIcon({ name, className }: { name: string; className?: string }) {
  const icon = useIcon(name)
  return icon ? <Icon icon={icon} className={className} /> : null
}

function ElementControl({
  el,
  interactive,
  row,
}: {
  el: UiElement
  interactive: boolean
  row?: boolean
}) {
  const editor = useEditor()
  const value = useLivePoint(
    hasPoint(el) ? { source: el.source, point: el.point } : null
  )
  const label = elementLabel(el)
  const overridden = value?.statusKind === "override"
  const connected = hasPoint(el) ? Boolean(getDataSource(el.source)) : true
  // On the board the shape takes no pointer at all, so controls keep their normal look;
  // in Present mode they're disabled only when they can't write.
  const canWrite = connected && (writesPoint(el) || el.kind === "value")
  const off = interactive && !canWrite
  const auto =
    el.releasable && overridden && hasPoint(el) ? (
      <Button
        size="xs"
        variant="outline"
        disabled={off}
        onClick={() => requestWrite(el, "auto")}
        title="Release the override"
      >
        Auto
      </Button>
    ) : null

  switch (el.kind) {
    case "button": {
      const run = () => {
        if (el.onClick === "go") return goTo(editor, el.target)
        const typed = coerceWriteValue(
          el.writeValue,
          kindOfValue(value) ?? null
        )
        if (typed === null) return
        requestWrite(el, typed)
      }
      const icon = el.icon ? (
        <NamedIcon name={el.icon} className={row ? "size-3.5" : "size-4"} />
      ) : null
      const iconOnly = icon && el.iconPosition === "only"
      return (
        <Button
          variant={el.variant}
          size={row ? "sm" : "lg"}
          className={cn(!row && "size-full gap-2 px-3 text-sm")}
          disabled={interactive && el.onClick === "write" && !canWrite}
          aria-label={iconOnly ? label : undefined}
          title={iconOnly ? label : undefined}
          onClick={run}
        >
          {el.iconPosition === "start" || iconOnly ? icon : null}
          {iconOnly ? null : <span className="truncate">{label}</span>}
          {el.iconPosition === "end" && !iconOnly ? icon : null}
        </Button>
      )
    }

    case "menu":
      return <MenuControl el={el} row={row} />

    case "nav":
      return <NavControl el={el} interactive={interactive} />

    case "badge": {
      const on = value?.value === true
      // Unbound, a badge is a label: filled with its color (or the theme's).
      const variant = !hasPoint(el)
        ? "default"
        : value?.statusKind === "alarm" || value?.statusKind === "fault"
          ? "destructive"
          : typeof value?.value === "boolean"
            ? on
              ? "default"
              : "secondary"
            : "outline"
      // On its own the badge is the whole shape: a pill as big as the box.
      const badge = (
        <Badge
          variant={variant}
          className={cn(!row && "size-full px-3 text-xs")}
        >
          <span className="truncate">
            {hasPoint(el) ? shown(el, value) : label}
          </span>
        </Badge>
      )
      return row ? <Row label={label}>{badge}</Row> : badge
    }

    case "value":
      return (
        <Frame row={row}>
          <Row label={label}>
            <span
              className={cn(
                "font-mono text-sm font-medium tabular-nums",
                el.color && "text-primary",
                value && TONE[value.statusKind]
              )}
              title={value?.status}
            >
              {shown(el, value)}
            </span>
            {auto}
          </Row>
        </Frame>
      )

    case "switch":
      return (
        <Frame row={row}>
          <Row label={label}>
            <span className="text-[11px] text-muted-foreground">
              {value ? shown(el, value) : ""}
            </span>
            {auto}
            <Switch
              checked={value?.value === true}
              disabled={off}
              aria-label={label}
              onCheckedChange={(checked) => requestWrite(el, checked)}
            />
          </Row>
        </Frame>
      )

    case "progress": {
      const n = numericValue(value)
      return (
        <Frame row={row}>
          {row ? (
            <Row label={label}>
              <Progress
                value={n === null ? null : percentOf(el, n)}
                className="w-28"
              />
              <Readout value={value} el={el} />
            </Row>
          ) : (
            <Stack label={label} readout={<Readout value={value} el={el} />}>
              <Progress value={n === null ? null : percentOf(el, n)} />
            </Stack>
          )}
        </Frame>
      )
    }

    case "slider":
      return (
        <SliderControl el={el} value={value} row={row} off={off} auto={auto} />
      )

    case "setpoint":
      return (
        <SetpointControl
          el={el}
          value={value}
          row={row}
          off={off}
          auto={auto}
        />
      )

    case "select":
      return (
        <SelectControl el={el} value={value} row={row} off={off} auto={auto} />
      )
  }
}

function Readout({
  el,
  value,
}: {
  el: UiElement
  value: LiveValue | undefined
}) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs tabular-nums",
        value && TONE[value.statusKind]
      )}
      title={value?.status}
    >
      {shown(el, value)}
    </span>
  )
}

/** Single elements sit on a card; panel rows are already on one. */
function Frame({
  row,
  children,
}: {
  row?: boolean
  children: React.ReactNode
}) {
  if (row) return <>{children}</>
  return (
    <div className="flex size-full flex-col justify-center rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-xs">
      {children}
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      {children}
    </div>
  )
}

function Stack({
  label,
  readout,
  children,
}: {
  label: string
  readout: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
        {readout}
      </div>
      {children}
    </div>
  )
}

interface ControlProps {
  el: UiElement
  value: LiveValue | undefined
  row?: boolean
  /** Present mode, but this control can't write. */
  off: boolean
  auto: React.ReactNode
}

/** Drag to a value; letting go asks to write it. */
function SliderControl({ el, value, row, off, auto }: ControlProps) {
  const live = numericValue(value)
  const [draft, setDraft] = useState<number | null>(null)
  const current = draft ?? live ?? el.min
  const slider = (
    <Slider
      min={el.min}
      max={el.max}
      step={el.step}
      value={[current]}
      disabled={off}
      className={cn(row && "w-28")}
      onValueChange={(next) =>
        setDraft(Array.isArray(next) ? next[0] : (next as number))
      }
      onValueCommitted={(next) => {
        const n = snap(el, Array.isArray(next) ? next[0] : (next as number))
        if (live !== null && n === live) return setDraft(null)
        requestWrite(el, n, () => setDraft(null))
      }}
    />
  )
  const readout = (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      {draft !== null ? `→ ${draft}` : shown(el, value)}
    </span>
  )
  return (
    <Frame row={row}>
      {row ? (
        <Row label={elementLabel(el)}>
          {auto}
          {slider}
          {readout}
        </Row>
      ) : (
        <Stack
          label={elementLabel(el)}
          readout={
            <>
              {auto}
              {readout}
            </>
          }
        >
          {slider}
        </Stack>
      )}
    </Frame>
  )
}

/** Step a setpoint up or down, then Set it (one confirmation, not one per click). */
function SetpointControl({ el, value, row, off, auto }: ControlProps) {
  const live = numericValue(value)
  const [draft, setDraft] = useState<number | null>(null)
  const base = draft ?? live
  const bump = (dir: 1 | -1) =>
    setDraft(snap(el, (base ?? el.min) + dir * el.step))
  const changed = draft !== null && draft !== live
  const stepper = (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Lower"
        disabled={off}
        onClick={() => bump(-1)}
      >
        <Icon icon={MinusSignIcon} />
      </Button>
      <span
        className={cn(
          "min-w-14 text-center font-mono text-sm font-medium tabular-nums",
          changed && "rounded bg-primary px-1 text-primary-foreground",
          !changed && value && TONE[value.statusKind]
        )}
        title={value?.status}
      >
        {base === null
          ? "—"
          : `${base}${value?.units ? ` ${value.units}` : ""}`}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Raise"
        disabled={off}
        onClick={() => bump(1)}
      >
        <Icon icon={PlusSignIcon} />
      </Button>
      {changed ? (
        <Button
          size="sm"
          disabled={off}
          onClick={() => requestWrite(el, draft, () => setDraft(null))}
        >
          <Icon icon={Tick02Icon} data-icon="inline-start" />
          Set
        </Button>
      ) : null}
    </div>
  )
  return (
    <Frame row={row}>
      {row ? (
        <Row label={elementLabel(el)}>
          {auto}
          {stepper}
        </Row>
      ) : (
        <Stack label={elementLabel(el)} readout={auto}>
          {stepper}
        </Stack>
      )}
    </Frame>
  )
}

/** Pick one of a multistate point's states. */
function SelectControl({ el, value, row, off, auto }: ControlProps) {
  const options = useEnumOptions(el)
  const current =
    typeof value?.value === "string" || typeof value?.value === "number"
      ? String(value.value)
      : null
  const select = (
    <Select
      value={current}
      disabled={off || !options.length}
      onValueChange={(next) => {
        if (typeof next === "string" && next !== current) requestWrite(el, next)
      }}
    >
      <SelectTrigger size="sm" className={cn(row ? "w-32" : "w-full")}>
        <SelectValue placeholder={value?.display ?? "—"}>
          {value?.display ?? current ?? "—"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.replace(/^\w/, (c) => c.toUpperCase())}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  return (
    <Frame row={row}>
      {row ? (
        <Row label={elementLabel(el)}>
          {auto}
          {select}
        </Row>
      ) : (
        <Stack label={elementLabel(el)} readout={auto}>
          {select}
        </Stack>
      )}
    </Frame>
  )
}

/** Whether a link points at the page on screen (for the nav bar's current item). */
function isCurrent(link: NavLink, pageId: string) {
  const target = parseTarget(link.target)
  return target?.kind === "page" && target.pageId === pageId
}

/** A button that opens a list of places to go. */
function MenuControl({ el, row }: { el: UiElement; row?: boolean }) {
  const editor = useEditor()
  const label = elementLabel(el)
  const trigger = (
    <Button
      variant={el.variant}
      size={row ? "sm" : "lg"}
      className={cn(!row && "size-full gap-2 px-3 text-sm")}
    />
  )
  return (
    <DropdownMenu>
      {/* On the board the shape ignores the pointer, so the menu only opens in Present. */}
      <DropdownMenuTrigger render={trigger}>
        {el.icon ? (
          <NamedIcon name={el.icon} className={row ? "size-3.5" : "size-4"} />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <Icon
          icon={ArrowDown01Icon}
          className={cn("opacity-70", row ? "size-3.5" : "size-4")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-44"
        style={accentStyle(el.color)}
      >
        {el.links.map((link, i) => (
          <DropdownMenuItem
            key={i}
            disabled={!link.target}
            onClick={() => goTo(editor, link.target)}
          >
            {link.icon ? <NamedIcon name={link.icon} /> : null}
            {link.label || `Link ${i + 1}`}
          </DropdownMenuItem>
        ))}
        {!el.links.length ? (
          <DropdownMenuItem disabled>No links yet</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A strip of places to go; the one for the page on screen is highlighted. */
function NavControl({
  el,
  interactive,
}: {
  el: UiElement
  interactive: boolean
}) {
  const editor = useEditor()
  const pageId = useValue("current page", () => editor.getCurrentPageId(), [
    editor,
  ])
  const column = el.layout === "column"
  return (
    <nav
      aria-label={el.label || "Navigation"}
      className={cn(
        "flex size-full gap-1 rounded-lg border bg-card p-1 text-card-foreground shadow-xs",
        column ? "flex-col" : "flex-row"
      )}
    >
      {el.links.map((link, i) => {
        const current = isCurrent(link, pageId)
        return (
          <button
            key={i}
            type="button"
            aria-current={current ? "page" : undefined}
            disabled={interactive && !link.target}
            onClick={() => goTo(editor, link.target)}
            className={cn(
              "flex h-8 min-w-0 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors",
              column ? "w-full justify-start" : "flex-1 justify-center",
              current
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {link.icon ? (
              <NamedIcon name={link.icon} className="size-3.5" />
            ) : null}
            <span className="truncate">{link.label || `Link ${i + 1}`}</span>
          </button>
        )
      })}
      {!el.links.length ? (
        <span className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Add links in the properties panel
        </span>
      ) : null}
    </nav>
  )
}
