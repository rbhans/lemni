"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  atom,
  defaultHandleExternalTldrawContent,
  useEditor,
  useValue,
  type Editor,
  type TLContent,
  type TLShape,
  type TLShapeId,
} from "tldraw"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { isTypingTarget } from "../lib/hotkeys"
import { usePluginRuntime } from "../plugins/runtime"
import type { PasteOptionContribution, StudioContext } from "../plugins/types"
import { useStudioContext } from "../studio-context"

// Plain paste brings the drawing (and names); behaviors, links and anything else a
// plugin carries are left out. Paste special lists those as checkboxes.

interface Copied {
  content: TLContent
  /** What each paste option captured at copy time. */
  captured: Record<string, unknown>
}

const copied = atom<Copied | null>("copied for paste special", null)
export const pasteSpecialOpen = atom("paste special open", false)

/** The options in play, kept here so copy handlers outside React can reach them. */
let currentOptions: readonly PasteOptionContribution[] = []

const STAMP = "pastedFrom"

/** Remembers the selection for Paste special (called on every copy and cut). */
export function rememberCopy(editor: Editor) {
  const ids = editor.getSelectedShapeIds()
  if (!ids.length) return
  const content = editor.getContentFromCurrentPage(ids)
  if (!content) return
  const all = content.shapes.map((shape) => shape.id)
  const captured: Record<string, unknown> = {}
  for (const option of currentOptions)
    if (option.capture) captured[option.id] = option.capture(editor, all)
  copied.set({ content: structuredClone(content), captured })
}

function strip(
  shape: TLShape,
  options: readonly PasteOptionContribution[]
): TLShape {
  return options.reduce((s, option) => option.strip?.(s) ?? s, shape)
}

/**
 * Plain paste leaves out what paste options carry; copies are remembered for Paste
 * special. Call once inside the editor.
 */
export function usePasteHandling() {
  const editor = useEditor()
  const { contributions } = usePluginRuntime()

  useEffect(() => {
    currentOptions = contributions.pasteOptions
  }, [contributions.pasteOptions])

  useEffect(() => {
    editor.registerExternalContentHandler("tldraw", (info) =>
      defaultHandleExternalTldrawContent(editor, {
        ...info,
        content: {
          ...info.content,
          shapes: info.content.shapes.map((shape) =>
            strip(shape, currentOptions)
          ),
        },
      })
    )
    const onCopy = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return
      rememberCopy(editor)
    }
    document.addEventListener("copy", onCopy, true)
    document.addEventListener("cut", onCopy, true)
    return () => {
      document.removeEventListener("copy", onCopy, true)
      document.removeEventListener("cut", onCopy, true)
    }
  }, [editor])
}

/** Pastes the last copy, keeping what `keep` names, then lets options re-apply it. */
async function pasteSpecial(
  ctx: StudioContext,
  options: readonly PasteOptionContribution[],
  keep: ReadonlySet<string>
) {
  const { editor } = ctx
  const buffer = copied.get()
  if (!buffer) {
    toast.info("Copy something on the board first.")
    return
  }
  const leaveOut = options.filter((option) => !keep.has(option.id))
  const content = structuredClone(buffer.content)
  // Stamp each copy with its original, to know which new shape came from which.
  content.shapes = content.shapes.map((shape) => {
    const next = strip(shape, leaveOut)
    return { ...next, meta: { ...next.meta, [STAMP]: shape.id } }
  })
  editor.markHistoryStoppingPoint("paste special")
  await defaultHandleExternalTldrawContent(editor, {
    content,
    point: editor.getViewportPageBounds().center,
  })
  const ids = new Map<TLShapeId, TLShapeId>()
  editor.run(() => {
    for (const id of editor.getCurrentPageShapeIds()) {
      const shape = editor.getShape(id)
      const from = shape?.meta[STAMP]
      if (!shape || typeof from !== "string") continue
      ids.set(from as TLShapeId, id)
      const { [STAMP]: _stamp, ...meta } = shape.meta
      void _stamp
      editor.store.put([{ ...shape, meta }])
    }
    for (const option of options)
      if (keep.has(option.id))
        option.restore?.(ctx, ids, buffer.captured[option.id])
  })
}

/** Edit → Paste special…: choose what the pasted copy keeps. */
export function PasteSpecialDialog() {
  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()
  const open = useValue(pasteSpecialOpen)
  const options = contributions.pasteOptions
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())

  const close = () => {
    pasteSpecialOpen.set(false)
    ctx.editor.focus()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Paste special</DialogTitle>
          <DialogDescription>
            Choose what the pasted copy keeps. A plain paste (⌘V) brings the
            drawing and names only.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-2 text-xs font-medium"
            >
              <Checkbox
                checked={!unchecked.has(option.id)}
                onCheckedChange={(checked) =>
                  setUnchecked((prev) => {
                    const next = new Set(prev)
                    if (checked) next.delete(option.id)
                    else next.add(option.id)
                    return next
                  })
                }
              />
              {option.label}
            </label>
          ))}
          {!options.length ? (
            <p className="text-xs text-muted-foreground">
              No plugin adds anything to choose here.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const keep = new Set(
                options
                  .map((option) => option.id)
                  .filter((id) => !unchecked.has(id))
              )
              close()
              void pasteSpecial(ctx, options, keep)
            }}
          >
            Paste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
