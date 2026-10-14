"use client"

import {
  ArrowUpRight01Icon,
  Delete02Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { useEditor, useValue, type Editor } from "tldraw"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteLink,
  endLabel,
  endPlace,
  getLinks,
  goToEnd,
  linkMark,
  linkToMark,
  markForLink,
  selectedEnd,
  selectedLink,
  setLinkComment,
} from "@/studio/links/links"
import {
  connects,
  endKey,
  linksOf,
  otherEnd,
  sameEnd,
  sideOf,
  type BoardLink,
  type LinkEnd,
} from "@/studio/links/model"
import { Icon } from "@/studio/shell/icon"

import { isNodeShape } from "./wire-sheet"

/** The end the selection stands for: a frame or card, or a wire sheet box. */
export function endForSelection(editor: Editor): LinkEnd | null {
  const shapes = editor.getSelectedShapes()
  if (shapes.length === 1 && isNodeShape(shapes[0])) return shapes[0].props.end
  return selectedEnd(editor)
}

export const hasLinkContext = (editor: Editor) =>
  selectedLink.get() !== null || endForSelection(editor) !== null

export function LinksSection() {
  const editor = useEditor()
  const linkId = useValue(selectedLink)
  const end = useValue("link context", () => endForSelection(editor), [editor])
  if (linkId) return <LinkDetails id={linkId} />
  return end ? <EndLinks end={end} /> : null
}

function EndLinks({ end }: { end: LinkEnd }) {
  const editor = useEditor()
  const key = endKey(end)
  const links = useValue(
    "end links",
    () => linksOf(getLinks(editor), end),
    // `end` is described fully by its key.
    [editor, key]
  )
  const mark = useValue(linkMark)
  const markLabel = useValue(
    "mark label",
    () => {
      const m = linkMark.get()
      return m ? endLabel(editor, m) : ""
    },
    [editor]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            markForLink(end)
            editor.focus()
          }}
        >
          <Icon icon={Link01Icon} className="size-3" />
          Link mark
        </Button>
        {mark &&
        !sameEnd(mark, end) &&
        !links.some((link) => connects(link, mark, end)) ? (
          <Button
            size="sm"
            className="min-w-0"
            onClick={() => linkToMark(editor, end)}
          >
            <span className="truncate">Link to {markLabel}</span>
          </Button>
        ) : null}
      </div>
      {links.map((link) => (
        <LinkRow key={link.id} link={link} here={sideOf(link, end)} />
      ))}
      {!links.length ? (
        <p className="text-[11px] text-muted-foreground">
          No links yet. Link mark this, then pick Link on something else (or the
          other way round).
        </p>
      ) : null}
    </div>
  )
}

function LinkRow({ link, here }: { link: BoardLink; here: LinkEnd }) {
  const editor = useEditor()
  const other = otherEnd(link, here)
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {endLabel(editor, other)}
          </p>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {endPlace(editor, other)}
            {here.kind === "docPage" ? ` · from p. ${here.page}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Go to ${endLabel(editor, other)}`}
          onClick={() => goToEnd(editor, other)}
        >
          <Icon icon={ArrowUpRight01Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Remove link"
          onClick={() => deleteLink(editor, link.id)}
        >
          <Icon icon={Delete02Icon} className="size-3.5" />
        </Button>
      </div>
      <CommentField link={link} />
    </div>
  )
}

function CommentField({ link }: { link: BoardLink }) {
  const editor = useEditor()
  return (
    <Textarea
      key={`${link.id}:${link.comment}`}
      aria-label="Link comment"
      rows={2}
      className="min-h-0 text-xs"
      defaultValue={link.comment}
      placeholder="Add a comment (how they're related)…"
      onBlur={(event) => setLinkComment(editor, link.id, event.target.value)}
    />
  )
}

/** A wire picked on the wire sheet. */
function LinkDetails({ id }: { id: string }) {
  const editor = useEditor()
  const link = useValue(
    "selected link",
    () => getLinks(editor).find((l) => l.id === id) ?? null,
    [editor, id]
  )
  if (!link) return null
  return (
    <div className="flex flex-col gap-2">
      {[link.a, link.b].map((end) => (
        <div key={endKey(end)} className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {endLabel(editor, end)}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {endPlace(editor, end)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Go to ${endLabel(editor, end)}`}
            onClick={() => {
              selectedLink.set(null)
              goToEnd(editor, end)
            }}
          >
            <Icon icon={ArrowUpRight01Icon} className="size-3.5" />
          </Button>
        </div>
      ))}
      <CommentField link={link} />
      <Button
        variant="outline"
        size="sm"
        className="self-start text-destructive"
        onClick={() => deleteLink(editor, link.id)}
      >
        <Icon icon={Delete02Icon} className="size-3" />
        Remove link
      </Button>
    </div>
  )
}
