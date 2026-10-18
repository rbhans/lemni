"use client"

import { useState, type MouseEvent } from "react"
import { Activity01Icon, PlugSocketIcon } from "@hugeicons/core-free-icons"
import { useEditor, useValue, type Editor } from "tldraw"

import { Button } from "@/components/ui/button"
import { currentPageKind, Icon, shell, useDataSources } from "@/sdk"

import { offerMatches, pointQueries } from "./live-points"
import { isSheetShape, type SheetShape } from "./sheet-shape"

// A table that lists points can be matched to a connected station at any time (it may
// have come in before the station was connected).

const counts = new WeakMap<readonly (readonly string[])[], number>()

/** How many points a sheet's rows name; 0 when it isn't a points list. */
function pointCount(shape: SheetShape) {
  let count = counts.get(shape.props.rows)
  if (count === undefined) {
    count = pointQueries([shape.props.columns, ...shape.props.rows]).length
    counts.set(shape.props.rows, count)
  }
  return count
}

function selectedList(editor: Editor): SheetShape | null {
  const selected = editor.getSelectedShapes()
  const shape = selected.length === 1 ? selected[0] : null
  return isSheetShape(shape) && pointCount(shape) > 0 ? shape : null
}

export const hasPointsListSelected = (editor: Editor) =>
  selectedList(editor) !== null

export function SheetPointsSection() {
  const editor = useEditor()
  const shape = useValue("selected points list", () => selectedList(editor), [
    editor,
  ])
  const onUiPage = useValue(
    "on a UI page",
    () => currentPageKind(editor) === "ui",
    [editor]
  )
  const sources = useDataSources().filter((source) => source.search)
  const [busy, setBusy] = useState(false)
  if (!shape) return null
  const count = pointCount(shape)

  const match = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget.getBoundingClientRect()
    const bounds = editor.getShapePageBounds(shape)
    const view = editor.getViewportPageBounds()
    // Beside the table (right, left, below, above) where that's in view, else the
    // middle of the view.
    const beside = bounds
      ? [
          { x: bounds.maxX + 360, y: bounds.center.y },
          { x: bounds.minX - 360, y: bounds.center.y },
          { x: bounds.center.x, y: bounds.maxY + 260 },
          { x: bounds.center.x, y: bounds.minY - 260 },
        ].find((spot) => view.containsPoint(spot))
      : undefined
    setBusy(true)
    await offerMatches({
      queries: pointQueries([shape.props.columns, ...shape.props.rows]),
      name: shape.props.title,
      at: beside ?? view.center,
      client: { x: button.left, y: button.bottom + 4 },
    })
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11.5px] text-muted-foreground">
        This table lists {count} {count === 1 ? "point" : "points"}.{" "}
        {sources.length
          ? "Match them to the connected station to show them live: as a table, a panel or a trend."
          : "Connect to their station to show them live."}
      </p>
      {sources.length ? (
        <Button
          variant="outline"
          disabled={busy || !onUiPage}
          onClick={(event) => void match(event)}
        >
          <Icon icon={Activity01Icon} className="size-3.5" />
          {busy ? "Matching…" : "Match to points…"}
        </Button>
      ) : (
        <Button variant="outline" onClick={() => shell.openConnect()}>
          <Icon icon={PlugSocketIcon} className="size-3.5" />
          Connect…
        </Button>
      )}
      {sources.length && !onUiPage ? (
        <p className="text-[11px] text-muted-foreground">
          Live values go on UI pages: copy the table to one, or match from
          there.
        </p>
      ) : null}
    </div>
  )
}
