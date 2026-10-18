"use client"

import { useState } from "react"
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue, type Editor } from "tldraw"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Icon,
  NumberField,
  PointField,
  PropertyRow,
  Segmented,
  SelectField,
  TargetField,
} from "@/sdk"

import { ColorPicker, IconPicker, LinksEditor } from "./editors"
import {
  pointFields,
  setPanelRows,
  setPanelTitle,
  updateElement,
} from "./insert"
import {
  BUTTON_VARIANTS,
  elementLabel,
  KIND_LABEL,
  NAVIGATES,
  newElement,
  OVERRIDE_LENGTHS,
  UI_KINDS,
  WRITES,
  type ButtonVariant,
  type IconPosition,
  type NavLayout,
  type UiElement,
  type UiKind,
} from "./model"
import {
  elementOf,
  isElementShape,
  isPanelShape,
  rowsOf,
  type UiElementShape,
  type UiPanelShape,
} from "./shapes"

export const hasElementSelected = (editor: Editor) =>
  isElementShape(editor.getOnlySelectedShape())
export const hasPanelSelected = (editor: Editor) =>
  isPanelShape(editor.getOnlySelectedShape())

/** A text box that commits on blur or Enter. */
function TextBox({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit(value: string): void
}) {
  return (
    <Input
      key={value}
      aria-label={label}
      className="h-7 text-xs"
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(event) => {
        if (event.target.value !== value) onCommit(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}

/** Everything about one element; used for single elements and for panel rows. */
function ElementFields({
  el,
  onChange,
  pickLabel,
  inPanel,
}: {
  el: UiElement
  onChange(patch: Partial<UiElement>): void
  pickLabel: string
  inPanel?: boolean
}) {
  const writes =
    WRITES.has(el.kind) || (el.kind === "button" && el.onClick === "write")
  return (
    <div className="flex flex-col gap-2">
      <PropertyRow label="Kind">
        <SelectField<UiKind>
          label="Kind"
          value={el.kind}
          options={UI_KINDS.map((k) => ({
            value: k,
            label: KIND_LABEL[k],
          }))}
          onChange={(kind) => {
            if (kind === el.kind) return
            const fresh = newElement(kind)
            onChange({
              kind,
              min: fresh.min,
              max: fresh.max,
              step: fresh.step,
              ...(kind === "button" && !el.label ? { label: "Button" } : {}),
              ...(kind === "menu" && !el.label ? { label: fresh.label } : {}),
              // Dropdowns and nav bars start with a few placeholder links to fill in.
              ...(NAVIGATES.has(kind) && !el.links.length
                ? { links: fresh.links }
                : {}),
            })
          }}
        />
      </PropertyRow>
      <PropertyRow label="Label">
        <TextBox
          label="Label"
          value={el.label}
          placeholder={el.pointLabel || KIND_LABEL[el.kind]}
          onCommit={(label) => onChange({ label })}
        />
      </PropertyRow>
      <PropertyRow label="Color">
        <ColorPicker
          value={el.color}
          onChange={(color) => onChange({ color })}
        />
      </PropertyRow>

      {el.kind === "button" ? (
        <PropertyRow label="On click">
          <Segmented<"go" | "write">
            label="On click"
            value={el.onClick}
            options={[
              { value: "go", label: "Go to" },
              { value: "write", label: "Write" },
            ]}
            onChange={(onClick) => onChange({ onClick })}
          />
        </PropertyRow>
      ) : null}

      {NAVIGATES.has(el.kind) ? (
        <>
          {el.kind === "nav" ? (
            <PropertyRow label="Layout">
              <Segmented<NavLayout>
                label="Layout"
                value={el.layout}
                options={[
                  { value: "row", label: "Side by side" },
                  { value: "column", label: "Stacked" },
                ]}
                onChange={(layout) => onChange({ layout })}
              />
            </PropertyRow>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Links</span>
              <Button
                variant="ghost"
                size="xs"
                disabled={el.links.length >= 20}
                onClick={() =>
                  onChange({
                    links: [...el.links, { label: "", target: "", icon: "" }],
                  })
                }
              >
                <Icon icon={Add01Icon} data-icon="inline-start" />
                Add link
              </Button>
            </div>
            <LinksEditor
              links={el.links}
              onChange={(links) => onChange({ links })}
              pickLabel={(link, i) =>
                `“${link.label || `Link ${i + 1}`}” in ${pickLabel}`
              }
            />
          </div>
        </>
      ) : el.kind === "button" && el.onClick === "go" ? (
        <PropertyRow label="Go to">
          <div className="min-w-0 flex-1">
            <TargetField
              value={el.target}
              pickLabel={pickLabel}
              onChange={(target) => onChange({ target })}
            />
          </div>
        </PropertyRow>
      ) : (
        <PropertyRow label="Point">
          <PointField
            compact
            value={
              el.point
                ? { source: el.source, point: el.point, label: el.pointLabel }
                : null
            }
            onChange={(ref) => onChange(pointFields(ref))}
            placeholder={
              writes ? "Choose the point it writes" : "Choose a point"
            }
          />
        </PropertyRow>
      )}

      {el.kind === "button" && el.onClick === "write" ? (
        <PropertyRow label="Writes">
          <TextBox
            label="Value it writes"
            value={el.writeValue}
            placeholder="e.g. 72, On, occupied"
            onCommit={(writeValue) => onChange({ writeValue })}
          />
        </PropertyRow>
      ) : null}

      {el.kind === "button" || el.kind === "menu" ? (
        <PropertyRow label="Icon">
          <IconPicker value={el.icon} onChange={(icon) => onChange({ icon })} />
        </PropertyRow>
      ) : null}

      {el.kind === "button" && el.icon ? (
        <PropertyRow label="Icon at">
          <Segmented<IconPosition>
            label="Icon position"
            value={el.iconPosition}
            options={[
              { value: "start", label: "Start" },
              { value: "end", label: "End" },
              { value: "only", label: "Icon only" },
            ]}
            onChange={(iconPosition) => onChange({ iconPosition })}
          />
        </PropertyRow>
      ) : null}

      {(el.kind === "button" || el.kind === "menu") && !inPanel ? (
        <PropertyRow label="Style">
          <SelectField<ButtonVariant>
            label="Style"
            value={el.variant}
            options={BUTTON_VARIANTS.map((v) => ({
              value: v,
              label: v.replace(/^\w/, (c) => c.toUpperCase()),
            }))}
            onChange={(variant) => onChange({ variant })}
          />
        </PropertyRow>
      ) : null}

      {el.kind === "slider" ||
      el.kind === "setpoint" ||
      el.kind === "progress" ? (
        <PropertyRow label="Range">
          <NumberField
            label="Minimum"
            prefix="↓"
            value={el.min}
            onCommit={(min) => onChange({ min })}
          />
          <NumberField
            label="Maximum"
            prefix="↑"
            value={el.max}
            onCommit={(max) => onChange({ max })}
          />
          {el.kind !== "progress" ? (
            <NumberField
              label="Step"
              prefix="±"
              value={el.step}
              onCommit={(step) => onChange({ step })}
            />
          ) : null}
        </PropertyRow>
      ) : null}

      {el.kind === "switch" || el.kind === "badge" || el.kind === "value" ? (
        <PropertyRow label="On / off">
          <TextBox
            label="Word for on"
            value={el.onText}
            placeholder="On"
            onCommit={(onText) => onChange({ onText: onText || "On" })}
          />
          <TextBox
            label="Word for off"
            value={el.offText}
            placeholder="Off"
            onCommit={(offText) => onChange({ offText: offText || "Off" })}
          />
        </PropertyRow>
      ) : null}

      {el.kind === "select" ? (
        <PropertyRow label="Choices">
          <TextBox
            label="Choices"
            value={el.options.join(", ")}
            placeholder="From the station"
            onCommit={(text) =>
              onChange({
                options: text
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
          />
        </PropertyRow>
      ) : null}

      {writes ? (
        <>
          <PropertyRow label="Write as">
            <Segmented<"set" | "override">
              label="Write as"
              value={el.writeMode}
              options={[
                { value: "set", label: "Set" },
                { value: "override", label: "Override" },
              ]}
              onChange={(writeMode) => onChange({ writeMode })}
            />
          </PropertyRow>
          {el.writeMode === "override" ? (
            <PropertyRow label="For">
              <SelectField<string>
                label="Override length"
                value={String(el.overrideSec)}
                options={OVERRIDE_LENGTHS.map((o) => ({
                  value: String(o.sec),
                  label: o.label,
                }))}
                onChange={(sec) => onChange({ overrideSec: Number(sec) })}
              />
            </PropertyRow>
          ) : null}
        </>
      ) : null}

      {writes || el.kind === "value" ? (
        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          Show “Auto” to release an override
          <Switch
            size="sm"
            checked={el.releasable}
            onCheckedChange={(releasable) => onChange({ releasable })}
          />
        </label>
      ) : null}

      {writes ? (
        <p className="text-[11px] text-muted-foreground">
          Works in Present mode. Every write asks you to confirm first.
        </p>
      ) : null}
    </div>
  )
}

export function ElementSection() {
  const editor = useEditor()
  const shape = useValue(
    "ui element",
    () => {
      const s = editor.getOnlySelectedShape()
      return isElementShape(s) ? s : null
    },
    [editor]
  )
  if (!shape) return null
  const el = elementOf(shape)
  return (
    <ElementFields
      el={el}
      pickLabel={`the “${elementLabel(el)}” button`}
      onChange={(patch) => {
        const current = editor.getShape(shape.id)
        if (isElementShape(current))
          updateElement(editor, current as UiElementShape, patch)
      }}
    />
  )
}

export function PanelSection() {
  const editor = useEditor()
  const shape = useValue(
    "ui panel",
    () => {
      const s = editor.getOnlySelectedShape()
      return isPanelShape(s) ? s : null
    },
    [editor]
  )
  const [open, setOpen] = useState<number | null>(null)
  if (!shape) return null
  const rows = rowsOf(shape)
  const latest = () => {
    const s = editor.getShape(shape.id)
    return isPanelShape(s) ? (s as UiPanelShape) : null
  }
  const save = (next: typeof rows) => {
    const s = latest()
    if (s) setPanelRows(editor, s, next)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
    setOpen(open === i ? j : open)
  }

  return (
    <div className="flex flex-col gap-2">
      <PropertyRow label="Title">
        <TextBox
          label="Panel title"
          value={shape.props.title}
          placeholder="No title"
          onCommit={(title) => {
            const s = latest()
            if (s) setPanelTitle(editor, s, title)
          }}
        />
      </PropertyRow>
      <div className="flex flex-col rounded-md border">
        {rows.map((row, i) => (
          <div key={i} className={cn(i > 0 && "border-t")}>
            <div className="group flex h-7 items-center gap-1 pr-1 pl-2 text-xs">
              <span className="w-14 shrink-0 truncate text-[10.5px] text-muted-foreground">
                {KIND_LABEL[row.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {elementLabel(row)}
              </span>
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
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon icon={ArrowDown01Icon} className="size-3" />
              </Button>
              <Button
                variant={open === i ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label={`Edit ${elementLabel(row)}`}
                onClick={() => setOpen(open === i ? null : i)}
              >
                <Icon icon={Edit02Icon} className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${elementLabel(row)}`}
                onClick={() => {
                  save(rows.filter((_, j) => j !== i))
                  setOpen(null)
                }}
              >
                <Icon icon={Delete02Icon} className="size-3" />
              </Button>
            </div>
            {open === i ? (
              <div className="border-t bg-muted/30 p-2">
                <ElementFields
                  el={row}
                  inPanel
                  pickLabel={`the “${elementLabel(row)}” row`}
                  onChange={(patch) => {
                    const fresh = latest()
                    if (!fresh) return
                    const current = rowsOf(fresh)
                    current[i] = { ...current[i], ...patch }
                    setPanelRows(editor, fresh, current)
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
        {!rows.length ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">
            No rows yet. Drop points or a whole equipment folder from the
            Station panel onto the panel.
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          save([...rows, newElement("value")])
          setOpen(rows.length)
        }}
      >
        <Icon icon={Add01Icon} data-icon="inline-start" />
        Add row
      </Button>
    </div>
  )
}
