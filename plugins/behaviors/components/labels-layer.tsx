"use client"

import type { CSSProperties } from "react"
import { useEditor, useValue, type TLShapeId } from "tldraw"

import { useLivePoint } from "@/studio/data/live-points"
import { cn } from "@/lib/utils"

import { statusKindOf } from "../core/status"
import type { Behavior } from "../core/model"
import { effectiveBehaviors } from "../runtime/shapes"
import { liveEffects, testValues } from "../runtime/state"

type Placement = "top" | "bottom" | "left" | "right" | "center"
const GAP = 6

const SIZE: Record<string, number> = { s: 11, m: 13, l: 16 }

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--foreground)",
  override: "#b45309",
  alarm: "#e7000b",
  fault: "#ea580c",
  down: "#ea580c",
  stale: "var(--muted-foreground)",
  disabled: "var(--muted-foreground)",
  unknown: "var(--muted-foreground)",
}

/** Value labels, drawn in page space so they pan and zoom with the board. */
export function LabelsLayer() {
  const editor = useEditor()
  const live = useValue(liveEffects)
  const shapes = useValue(
    "label shapes",
    () => {
      const out: { id: TLShapeId; labels: Behavior[] }[] = []
      for (const id of editor.getCurrentPageShapeIds()) {
        const labels = effectiveBehaviors(editor, id).filter(
          (b) => b.enabled && b.effect === "label" && b.source
        )
        if (labels.length) out.push({ id, labels })
      }
      return out
    },
    [editor]
  )
  if (!live) return null
  return (
    <>
      {shapes.map(({ id, labels }) => (
        <ShapeLabels key={id} id={id} labels={labels} />
      ))}
    </>
  )
}

function ShapeLabels({ id, labels }: { id: TLShapeId; labels: Behavior[] }) {
  const editor = useEditor()
  const bounds = useValue("label bounds", () => editor.getShapePageBounds(id), [
    editor,
    id,
  ])
  if (!bounds) return null

  const groups = new Map<Placement, Behavior[]>()
  for (const label of labels) {
    const placement = (
      typeof label.params.placement === "string"
        ? label.params.placement
        : "bottom"
    ) as Placement
    groups.set(placement, [...(groups.get(placement) ?? []), label])
  }

  return (
    <>
      {[...groups.entries()].map(([placement, items]) => {
        // Shapes stack from maxShapesPerPage * 2 upward; labels always sit above them.
        const zIndex = editor.options.maxShapesPerPage * 4
        const style: CSSProperties = {
          position: "absolute",
          zIndex,
          display: "flex",
          gap: 3,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }
        if (placement === "bottom")
          Object.assign(style, {
            left: bounds.midX,
            top: bounds.maxY + GAP,
            transform: "translateX(-50%)",
            flexDirection: "column",
            alignItems: "center",
          })
        if (placement === "top")
          Object.assign(style, {
            left: bounds.midX,
            top: bounds.minY - GAP,
            transform: "translate(-50%, -100%)",
            flexDirection: "column-reverse",
            alignItems: "center",
          })
        if (placement === "left")
          Object.assign(style, {
            left: bounds.minX - GAP,
            top: bounds.midY,
            transform: "translate(-100%, -50%)",
            flexDirection: "column",
            alignItems: "flex-end",
          })
        if (placement === "right")
          Object.assign(style, {
            left: bounds.maxX + GAP,
            top: bounds.midY,
            transform: "translateY(-50%)",
            flexDirection: "column",
            alignItems: "flex-start",
          })
        if (placement === "center")
          Object.assign(style, {
            left: bounds.midX,
            top: bounds.midY,
            transform: "translate(-50%, -50%)",
            flexDirection: "column",
            alignItems: "center",
          })
        return (
          <div key={placement} style={style}>
            {items.map((label) => (
              <ValueLabel key={label.id} behavior={label} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function ValueLabel({ behavior }: { behavior: Behavior }) {
  const test = useValue("label test", () => testValues.get()[behavior.id], [
    behavior.id,
  ])
  const live = useLivePoint(behavior.source)
  const input = test ?? live
  const caption =
    typeof behavior.params.caption === "string" ? behavior.params.caption : ""
  const size =
    SIZE[
      typeof behavior.params.size === "string" ? behavior.params.size : "m"
    ] ?? 13
  const fixed =
    behavior.params.colorMode === "fixed" &&
    typeof behavior.params.color === "string"
  const kind = input ? statusKindOf(input.status, input.ok) : "unknown"
  const color = fixed ? (behavior.params.color as string) : STATUS_COLOR[kind]
  const solid = behavior.params.background !== false

  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 font-mono leading-none",
        solid && "rounded-md border border-border bg-background/95 shadow-xs"
      )}
      style={{
        fontSize: size,
        padding: solid ? `${size * 0.32}px ${size * 0.55}px` : 0,
      }}
    >
      {caption ? (
        <span style={{ color: "var(--muted-foreground)" }}>{caption}</span>
      ) : null}
      <span style={{ color }}>{input?.display ?? "—"}</span>
    </div>
  )
}
