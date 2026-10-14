"use client"

import { useState } from "react"
import {
  ArrangeIcon,
  Cancel01Icon,
  FlowConnectionIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  endLabel,
  getLinks,
  linkMark,
  pendingComment,
  setLinkComment,
} from "@/studio/links/links"
import { currentPageKind } from "@/studio/pages/page-categories"
import { Segmented } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { studioState } from "@/studio/state"

import { findWireSheet, nodesOn, resortWireSheet } from "./wire-sheet"

export function LinkOverlays() {
  const presenting = useValue(studioState.presenting)
  if (presenting) return null
  return (
    <>
      <MarkChip />
      <CommentDialog />
      <WireSheetBar />
    </>
  )
}

/** Shows what Link Mark is holding while you go find the other end. */
function MarkChip() {
  const editor = useEditor()
  const mark = useValue(linkMark)
  const label = useValue(
    "mark label",
    () => {
      const end = linkMark.get()
      return end ? endLabel(editor, end) : ""
    },
    [editor]
  )
  if (!mark) return null
  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-[400] flex max-w-[min(560px,90%)] -translate-x-1/2 items-center gap-2 rounded-full border bg-popover py-1 pr-1 pl-3 text-xs text-popover-foreground shadow-md">
      <Icon icon={Link01Icon} className="size-3.5 text-primary" />
      <span className="truncate">
        Marked <span className="font-medium">{label}</span>
      </span>
      <span className="hidden truncate text-muted-foreground sm:inline">
        · right-click something else and choose Link
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Clear link mark"
        onClick={() => {
          linkMark.set(null)
          editor.focus()
        }}
      >
        <Icon icon={Cancel01Icon} className="size-3" />
      </Button>
    </div>
  )
}

/** Right after linking: an optional comment, mainly for the AI's context. */
function CommentDialog() {
  const editor = useEditor()
  const id = useValue(pendingComment)
  const link = useValue(
    "pending link",
    () => getLinks(editor).find((l) => l.id === pendingComment.get()) ?? null,
    [editor]
  )
  const close = () => {
    pendingComment.set(null)
    editor.focus()
  }
  return (
    <Dialog
      open={id !== null && link !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {link ? (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Linked</DialogTitle>
            <DialogDescription>
              {endLabel(editor, link.a)} ↔ {endLabel(editor, link.b)}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const value = new FormData(event.currentTarget).get("comment")
              if (typeof value === "string" && value.trim())
                setLinkComment(editor, link.id, value)
              close()
            }}
          >
            <Textarea
              key={link.id}
              autoFocus
              name="comment"
              aria-label="Comment"
              rows={3}
              placeholder="How are they related? e.g. this sheet shows the sequence for that graphic."
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                  event.currentTarget.form?.requestSubmit()
              }}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Skip
              </Button>
              <Button type="submit">Save comment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/** The wire sheet's controls, and what to do when it's empty. */
function WireSheetBar() {
  const editor = useEditor()
  const state = useValue(
    "wire sheet bar",
    () => {
      if (currentPageKind(editor) !== "wiresheet") return null
      const page = findWireSheet(editor)
      if (!page) return null
      return {
        page,
        showAll: page.meta.showAll === true,
        boxes: nodesOn(editor, page).length,
        links: getLinks(editor).length,
      }
    },
    [editor]
  )
  const [busy, setBusy] = useState(false)
  if (!state) return null

  return (
    <>
      <div className="pointer-events-auto absolute top-3 left-3 z-[400] flex items-center gap-2 rounded-lg border bg-popover p-1 pl-2.5 text-xs text-popover-foreground shadow-md">
        <Icon
          icon={FlowConnectionIcon}
          className="size-3.5 text-muted-foreground"
        />
        <span className="font-medium">Wire sheet</span>
        <span className="text-muted-foreground tabular-nums">
          {state.links} {state.links === 1 ? "link" : "links"}
        </span>
        <Segmented<"linked" | "all">
          label="What the wire sheet shows"
          className="w-40 flex-none"
          value={state.showAll ? "all" : "linked"}
          options={[
            { value: "linked", label: "Linked" },
            { value: "all", label: "All frames" },
          ]}
          onChange={(value) => {
            editor.updatePage({
              id: state.page.id,
              meta: { ...state.page.meta, showAll: value === "all" },
            })
            editor.focus()
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || state.boxes < 2}
          onClick={() => {
            setBusy(true)
            resortWireSheet(editor)
            requestAnimationFrame(() => {
              editor.zoomToFit({ animation: { duration: 220 } })
              setBusy(false)
            })
          }}
        >
          <Icon icon={ArrangeIcon} className="size-3.5" />
          Re-sort
        </Button>
      </div>
      {state.boxes === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[300] flex items-center justify-center">
          <div className="max-w-sm rounded-xl border border-dashed bg-background/80 p-5 text-center">
            <Icon
              icon={FlowConnectionIcon}
              className="mx-auto size-5 text-muted-foreground"
            />
            <p className="mt-2 text-xs font-medium">No links yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Right-click a frame or document and choose Link mark, then
              right-click something else and choose Link. Linked things show up
              here, and you can drag between boxes to link more.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
