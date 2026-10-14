"use client"

import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A label that turns into a text field to rename something. Enter or leaving the
 * field commits; Escape cancels. `editing` can be driven from outside (e.g. a menu).
 */
export function InlineName({
  value,
  placeholder,
  label,
  onCommit,
  editing,
  onEditingChange,
  className,
  inputClassName,
  children,
}: {
  /** The current name, prefilled when editing starts. */
  value: string
  /** Shown faintly when the field is empty (the default label). */
  placeholder?: string
  /** Accessible name for the field, e.g. "Layer name". */
  label: string
  onCommit(next: string): void
  editing: boolean
  onEditingChange(editing: boolean): void
  className?: string
  inputClassName?: string
  /** What shows when not editing (defaults to the value or placeholder). */
  children?: ReactNode
}) {
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <span className={cn("truncate", className)}>
        {children ?? (value || placeholder)}
      </span>
    )
  }

  const finish = (commit: boolean) => {
    if (commit) onCommit(draft)
    onEditingChange(false)
  }

  return (
    <input
      aria-label={label}
      // Mounted only while editing, so focusing on mount is the intent.
      autoFocus
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation() // keep tldraw shortcuts out of the field
        if (e.key === "Enter") finish(true)
        if (e.key === "Escape") finish(false)
      }}
      className={cn(
        "h-6 min-w-0 flex-1 rounded-[5px] border border-ring bg-background px-1.5 text-xs outline-none",
        inputClassName
      )}
    />
  )
}

/** Remounts the field per editing session so the draft starts from the latest value. */
export function useInlineEditing() {
  const [session, setSession] = useState(0)
  const [editing, setEditing] = useState(false)
  return {
    editing,
    key: session,
    start() {
      setSession((n) => n + 1)
      setEditing(true)
    },
    setEditing,
  }
}
