"use client"

import { Fragment, useState, type ReactNode } from "react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { Tip } from "./tip"

/**
 * Compact numeric field with an inline prefix, Illustrator style. Edits are
 * committed on Enter or blur; Escape restores the current value.
 */
export function NumberField({
  label,
  prefix,
  value,
  onCommit,
  suffix,
  disabled,
  mixed,
  className,
}: {
  label: string
  prefix: ReactNode
  value: number | null
  onCommit(next: number): void
  suffix?: ReactNode
  disabled?: boolean
  mixed?: boolean
  className?: string
}) {
  const formatted =
    value === null || mixed ? "" : String(Math.round(value * 100) / 100)
  // `null` while not editing, so the field always shows the live value.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const next = Number.parseFloat(draft)
    setDraft(null)
    if (Number.isFinite(next) && next !== value) onCommit(next)
  }

  return (
    <label
      className={cn(
        "flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        disabled && "opacity-50",
        className
      )}
    >
      <span className="w-3 shrink-0 text-[11px] text-muted-foreground">
        {prefix}
      </span>
      <span className="sr-only">{label}</span>
      <input
        inputMode="decimal"
        value={draft ?? formatted}
        placeholder={mixed ? "Mixed" : ""}
        disabled={disabled}
        onFocus={(event) => {
          setDraft(formatted)
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] outline-none placeholder:text-muted-foreground"
      />
      {suffix ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </label>
  )
}

/** Label on the left, control on the right. */
export function PropertyRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  )
}

/** Standard header for dock panels. */
export function PanelHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 pr-2 pl-3.5">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children ? (
        <div className="flex items-center gap-0.5">{children}</div>
      ) : null}
    </div>
  )
}

/** Compact segmented control (one choice from a few). */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Shows the icon instead of the label (the label becomes its tooltip), for tight rows. */
  icon?: IconSvgElement
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T | null
  options: SegmentedOption<T>[]
  onChange(value: T): void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("grid flex-1 gap-0.5 rounded-md bg-muted p-0.5", className)}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => {
        const button = (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            aria-label={option.icon ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-6 items-center justify-center truncate rounded-[5px] px-1 text-[11px] text-muted-foreground hover:text-foreground",
              option.value === value &&
                "bg-background text-foreground shadow-xs"
            )}
          >
            {option.icon ? (
              <HugeiconsIcon
                icon={option.icon}
                strokeWidth={1.8}
                className="size-3.5"
                aria-hidden
              />
            ) : (
              option.label
            )}
          </button>
        )
        return option.icon ? (
          <Tip key={option.value} label={option.label}>
            {button}
          </Tip>
        ) : (
          button
        )
      })}
    </div>
  )
}

/** Swatch + hex input. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange(value: string): void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-1.5 focus-within:border-ring">
      <input
        type="color"
        aria-label={`${label} swatch`}
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(event) => onChange(event.target.value)}
        className="size-4.5 shrink-0 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-black/10 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <input
        aria-label={label}
        value={draft ?? value.replace(/^#/, "").toUpperCase()}
        onFocus={(event) => {
          setDraft(value.replace(/^#/, "").toUpperCase())
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (
            draft !== null &&
            /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(draft.trim())
          )
            onChange(`#${draft.trim().toLowerCase()}`)
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] outline-none"
      />
    </div>
  )
}

/** A compact select built on the menu primitives (consistent with the rest of the UI). */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  placeholder = "Choose…",
}: {
  label: string
  value: T | null
  options: { value: T; label: string; group?: string }[]
  onChange(value: T): void
  className?: string
  placeholder?: string
}) {
  const current = options.find((option) => option.value === value)
  const groups = [...new Set(options.map((option) => option.group ?? ""))]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-left text-xs hover:bg-muted/40",
              className
            )}
          />
        }
      >
        <span className={cn("truncate", !current && "text-muted-foreground")}>
          {current?.label ?? placeholder}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.6}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-44 overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(next) => onChange(next as T)}
        >
          {groups.map((group) => (
            <Fragment key={group}>
              {group ? <DropdownMenuLabel>{group}</DropdownMenuLabel> : null}
              {options
                .filter((option) => (option.group ?? "") === group)
                .map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    closeOnClick
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
