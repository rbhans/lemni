"use client"

import { useState } from "react"
import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  AlignVerticalDistributeCenterIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  Link01Icon,
  Rotate01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { useActions, useEditor, useValue, Vec, type Editor } from "tldraw"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NumberField } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { Tip } from "@/studio/shell/tip"

const DEG = 180 / Math.PI

export const hasSelection = (editor: Editor) =>
  editor.getSelectedShapeIds().length > 0

function readTransform(editor: Editor) {
  const ids = editor.getSelectedShapeIds()
  const page = editor.getSelectionPageBounds()
  const rotated = editor.getSelectionRotatedPageBounds()
  if (!ids.length || !page || !rotated) return null
  return {
    count: ids.length,
    x: page.x,
    y: page.y,
    w: rotated.w,
    h: rotated.h,
    rotation: (((editor.getSelectionRotation() * DEG) % 360) + 360) % 360,
    locked: editor.getSelectedShapes().some((shape) => shape.isLocked),
  }
}

/** Scales the selection about its top-left corner, respecting its rotation. */
function resizeSelection(editor: Editor, sx: number, sy: number) {
  const rotated = editor.getSelectionRotatedPageBounds()
  if (
    !rotated ||
    !Number.isFinite(sx) ||
    !Number.isFinite(sy) ||
    sx <= 0 ||
    sy <= 0
  )
    return
  const rotation = editor.getSelectionRotation()
  const origin = Vec.Rot(rotated.point, rotation)
  editor.markHistoryStoppingPoint("resize from properties")
  editor.run(() => {
    for (const id of editor.getSelectedShapeIds()) {
      editor.resizeShape(
        id,
        { x: sx, y: sy },
        { scaleOrigin: origin, scaleAxisRotation: rotation }
      )
    }
  })
}

export function TransformSection() {
  const editor = useEditor()
  const actions = useActions()
  const t = useValue("transform", () => readTransform(editor), [editor])
  const [lockRatio, setLockRatio] = useState(false)
  if (!t) return null

  const ids = () => editor.getSelectedShapeIds()
  const move = (dx: number, dy: number) => {
    editor.markHistoryStoppingPoint("move from properties")
    editor.nudgeShapes(ids(), { x: dx, y: dy })
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <NumberField
        label="X position"
        prefix="X"
        value={t.x}
        disabled={t.locked}
        onCommit={(x) => move(x - t.x, 0)}
      />
      <NumberField
        label="Y position"
        prefix="Y"
        value={t.y}
        disabled={t.locked}
        onCommit={(y) => move(0, y - t.y)}
      />
      <NumberField
        label="Width"
        prefix="W"
        value={t.w}
        disabled={t.locked}
        onCommit={(w) => {
          const s = w / t.w
          resizeSelection(editor, s, lockRatio ? s : 1)
        }}
      />
      <div className="flex gap-1">
        <NumberField
          label="Height"
          prefix="H"
          value={t.h}
          disabled={t.locked}
          className="flex-1"
          onCommit={(h) => {
            const s = h / t.h
            resizeSelection(editor, lockRatio ? s : 1, s)
          }}
        />
        <Tip label={lockRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={lockRatio}
            aria-label="Lock aspect ratio"
            onClick={() => setLockRatio((v) => !v)}
            className={cn(lockRatio && "bg-primary/25 text-primary-foreground")}
          >
            <Icon icon={Link01Icon} className="size-3.5" />
          </Button>
        </Tip>
      </div>
      <NumberField
        label="Rotation"
        prefix={<Icon icon={Rotate01Icon} className="size-3" />}
        suffix="°"
        value={t.rotation}
        disabled={t.locked}
        onCommit={(deg) => {
          editor.markHistoryStoppingPoint("rotate from properties")
          editor.rotateShapesBy(ids(), (deg - t.rotation) / DEG)
        }}
      />
      <div className="grid grid-cols-2 gap-1">
        <IconAction
          label="Flip horizontal"
          icon={FlipHorizontalIcon}
          onClick={() =>
            void actions["flip-horizontal"]?.onSelect("style-panel")
          }
        />
        <IconAction
          label="Flip vertical"
          icon={FlipVerticalIcon}
          onClick={() => void actions["flip-vertical"]?.onSelect("style-panel")}
        />
      </div>
    </div>
  )
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  kbd,
}: {
  label: string
  icon: IconSvgElement
  onClick(): void
  disabled?: boolean
  kbd?: string
}) {
  return (
    <Tip label={label} kbd={kbd}>
      <Button
        variant="outline"
        size="icon"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="w-full"
      >
        <Icon icon={icon} className="size-3.5" />
      </Button>
    </Tip>
  )
}

const ALIGN: {
  id: string
  label: string
  icon: IconSvgElement
  min: number
}[] = [
  { id: "align-left", label: "Align left", icon: AlignLeftIcon, min: 2 },
  {
    id: "align-center-horizontal",
    label: "Align horizontal centers",
    icon: AlignHorizontalCenterIcon,
    min: 2,
  },
  { id: "align-right", label: "Align right", icon: AlignRightIcon, min: 2 },
  { id: "align-top", label: "Align top", icon: AlignTopIcon, min: 2 },
  {
    id: "align-center-vertical",
    label: "Align vertical centers",
    icon: AlignVerticalCenterIcon,
    min: 2,
  },
  { id: "align-bottom", label: "Align bottom", icon: AlignBottomIcon, min: 2 },
  {
    id: "distribute-horizontal",
    label: "Distribute horizontally",
    icon: AlignHorizontalDistributeCenterIcon,
    min: 3,
  },
  {
    id: "distribute-vertical",
    label: "Distribute vertically",
    icon: AlignVerticalDistributeCenterIcon,
    min: 3,
  },
]

export function AlignSection() {
  const editor = useEditor()
  const actions = useActions()
  const count = useValue(
    "selection count",
    () => editor.getSelectedShapeIds().length,
    [editor]
  )
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {ALIGN.map((item) => (
        <Tip key={item.id} label={item.label} kbd={actions[item.id]?.kbd}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={item.label}
            disabled={count < item.min}
            onClick={() => void actions[item.id]?.onSelect("style-panel")}
            className="w-full"
          >
            <Icon icon={item.icon} className="size-4" />
          </Button>
        </Tip>
      ))}
    </div>
  )
}

export function ArrangeSection() {
  const editor = useEditor()
  const actions = useActions()
  const locked = useValue(
    "selection locked",
    () => editor.getSelectedShapes().every((s) => s.isLocked),
    [editor]
  )
  const run = (id: string) => void actions[id]?.onSelect("style-panel")
  return (
    <div className="grid grid-cols-5 gap-1">
      <IconAction
        label="Bring to front"
        icon={LayerBringToFrontIcon}
        kbd={actions["bring-to-front"]?.kbd}
        onClick={() => run("bring-to-front")}
      />
      <IconAction
        label="Bring forward"
        icon={LayerBringForwardIcon}
        kbd={actions["bring-forward"]?.kbd}
        onClick={() => run("bring-forward")}
      />
      <IconAction
        label="Send backward"
        icon={LayerSendBackwardIcon}
        kbd={actions["send-backward"]?.kbd}
        onClick={() => run("send-backward")}
      />
      <IconAction
        label="Send to back"
        icon={LayerSendToBackIcon}
        kbd={actions["send-to-back"]?.kbd}
        onClick={() => run("send-to-back")}
      />
      <IconAction
        label={locked ? "Unlock" : "Lock"}
        icon={locked ? SquareUnlock02Icon : SquareLock02Icon}
        kbd={actions["toggle-lock"]?.kbd}
        onClick={() => run("toggle-lock")}
      />
    </div>
  )
}
