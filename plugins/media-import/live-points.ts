"use client"

import { Table01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import type { VecLike } from "tldraw"

import {
  currentPageKind,
  getDataSources,
  offerPoints,
  shell,
  type PointDragData,
  type PointOfferExtra,
  type StudioContext,
} from "@/sdk"

import { importDocuments, readTables } from "./import"
import { documentKind, sheetFromRows } from "./model"
import {
  matchPoints,
  readPointsList,
  type MatchResult,
  type PointCandidate,
  type PointQuery,
} from "./points-list"

// A CSV or spreadsheet that lists points becomes live values: its rows are matched to
// the points of the connected stations, and the person picks what they become (a live
// table, a panel, a trend), or keeps the sheet.

/** Connected sources that can find points by name. */
const searchable = () => getDataSources().filter((source) => source.search)

async function searchAll(name: string): Promise<PointCandidate[]> {
  const lists = await Promise.all(
    searchable().map(async (source) =>
      (await source.search!(name)).map((option) => ({
        source: source.id,
        point: option.point,
        label: option.label,
        path: option.path,
        kind: option.kind,
      }))
    )
  )
  return lists.flat()
}

/** The point queries in a sheet's rows (headings first), or none. */
export function pointQueries(rows: readonly (readonly unknown[])[]) {
  const sheet = sheetFromRows(rows)
  return readPointsList([sheet.columns, ...sheet.rows])?.queries ?? []
}

function summary(result: MatchResult, total: number) {
  const parts = [`${result.matched.length} of ${total} rows match points`]
  if (result.ambiguous)
    parts.push(`${result.ambiguous} could be more than one point`)
  if (result.skipped)
    parts.push(`only the first ${total - result.skipped} were checked`)
  return parts.join("; ")
}

/**
 * Matches the rows to points and offers them at `at` (the menu at `client` when
 * given), with `extras` (keep the sheet). Resolves to false when nothing matched.
 */
export async function offerMatches({
  queries,
  name,
  at,
  client,
  extras = [],
}: {
  queries: readonly PointQuery[]
  name: string
  at: VecLike
  client?: { x: number; y: number }
  extras?: PointOfferExtra[]
}): Promise<boolean> {
  const sources = searchable()
  const where =
    sources.length === 1 ? sources[0].label : `${sources.length} connections`
  const result = await toast
    .promise(matchPoints(queries, searchAll), {
      loading: `Matching ${name} to points on ${where}…`,
      success: (found) =>
        found.matched.length
          ? summary(found, queries.length)
          : `None of the rows in ${name} match points on ${where}.`,
      error: `Couldn't search ${where}.`,
    })
    .unwrap()
    .catch(() => null)
  if (!result?.matched.length) return false
  const points: PointDragData[] = result.matched.map((match) => ({
    source: match.source,
    point: match.point,
    label: match.label,
    kind: match.kind,
  }))
  return offerPoints({
    points,
    label: `${points.length} points from ${name}`,
    at,
    client,
    extras,
  })
}

/**
 * A single CSV or spreadsheet dropped on a UI page that reads as a points list: with a
 * station connected, offer its matched points; without one, say so and import the
 * sheet. Resolves to true when it took the file, false to import it as usual.
 */
export async function offerPointsList(
  ctx: StudioContext,
  files: File[],
  point: VecLike | undefined
): Promise<boolean> {
  const { editor } = ctx
  if (files.length !== 1) return false
  const [file] = files
  const kind = documentKind(file)
  if ((kind !== "csv" && kind !== "sheet") || currentPageKind(editor) !== "ui")
    return false
  const queries = (await readTables(file).catch(() => [])).flatMap((table) =>
    pointQueries(table.rows)
  )
  if (!queries.length) return false
  if (!searchable().length) {
    toast.info(`${file.name} looks like a points list`, {
      description:
        "Connect to a station, then use Match to points in the table's properties to bring its rows in live.",
      action: { label: "Connect…", onClick: () => shell.openConnect() },
    })
    return false
  }
  return offerMatches({
    queries,
    name: file.name,
    at: point ?? editor.getViewportPageBounds().center,
    extras: [
      {
        id: "sheet",
        label: "Sheet, as it is",
        icon: Table01Icon,
        run: ({ editor }, where) => void importDocuments(editor, [file], where),
      },
    ],
  })
}
